import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { listExamsWithStatus, getExamResult, computeExamResult, getExamStudentResults } from '../../services/mockExamResultService';
import AuthImage from '../../components/AuthImage.jsx';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import PanelHeader from '../../components/PanelHeader.jsx';
import QuestionFilters from '../../components/QuestionFilters.jsx';
import QuestionStepper from '../../components/QuestionStepper.jsx';
import { ExamStatePill, Marker, MarkerIcon, MarkerLegend } from '../../components/QuestionMarkers.jsx';
import TopicScoreRows from '../../components/TopicScoreRows.jsx';
import { AudienceIcon } from '../../components/CalendarIcons.jsx';
import { useToast } from '../../components/Toast.jsx';
import usePanelLayout from '../../hooks/usePanelLayout.js';
import { orderByExamNumber } from '../../lib/groupQuestionsForDisplay.js';
import { formatDate, formatDateTime, formatTime } from '../../utils/dateFormat.js';
import IndividualReportView from './IndividualReportView.jsx';
// The list, panel and motion are the same as Approve Questions, so they share its styles
import '../../styles/shared/QuestionApprovals.css';
import '../../styles/shared/ExamResults.css';

const ITEMS_PER_PAGE = 10;
// A taker this many points or fewer under the threshold "nearly passed" (same as the server)
const NEAR_MISS_POINTS = 5;
const SCORE_TICKS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
// How often an exam without results checks for them while it is open
const POLL_MS = 30000;

// Where an exam's results stand: ready (computed, or an alumni exam with an attempt), to compute
// (a student exam that has ended without results) or pending (everything else)
const RESULT_STATES = {
  ready: { label: 'Ready', icon: <path d="M6 20V11M12 20V5M18 20v-6" /> },
  to_compute: { label: 'To compute', icon: <><path d="M12 6.5v7" /><path d="M12 17.5h.01" /></> },
  pending: { label: 'Pending', icon: <path d="M12 6v6l4 2" /> },
};

const AUDIENCE_LABELS = { student: 'Student exam', alumni: 'Alumni exam' };

const STATE_TABS = [
  { value: '', label: 'All' },
  ...Object.entries(RESULT_STATES).map(([value, { label }]) => ({ value, label })),
];

function AudienceMarkerIcon({ audience }) {
  return <AudienceIcon audience={audience} width="13" height="13" strokeWidth="2.4" />;
}

const LEGEND_ITEMS = [
  { text: 'Questions', className: 'ca-marker--count', content: '#' },
  ...Object.entries(RESULT_STATES).map(([state, { label, icon }]) => ({
    text: label,
    className: `er-result--${state}`,
    content: <MarkerIcon>{icon}</MarkerIcon>,
  })),
  ...Object.entries(AUDIENCE_LABELS).map(([audience, label]) => ({
    text: label,
    className: 'ca-marker--audience',
    content: <AudienceMarkerIcon audience={audience} />,
  })),
];

const PANEL_VIEWS = [
  { value: 'overall', label: 'Overall' },
  { value: 'questions', label: 'Questions' },
  { value: 'individual', label: 'Individual' },
];

const NO_INDIVIDUAL = { examId: null, loading: false, error: '', students: [], questions: {}, examEnded: false };

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function getAudience(exam) {
  return exam?.targetAudience || 'student';
}

function getThreshold(exam) {
  return exam?.passingThreshold ?? 70;
}

function formatProgramLabel(program) {
  return program?.name || program?.code || '-';
}

function getProgramId(exam) {
  return String(exam.program?._id || exam.program || '');
}

function subjectKey(tag) {
  return String(tag?._id || tag?.name || '');
}

// Subjects with a name; an older server sends only their ids
function getNamedSubjects(exam) {
  return (exam.subjectTags || []).filter((tag) => tag?.name);
}

function hasEnded(exam) {
  if (exam.status === 'draft') return false;
  if (exam.status === 'finished' || exam.status === 'archived') return true;
  return Boolean(exam.endDateTime) && new Date(exam.endDateTime) < new Date();
}

function getResultState(exam) {
  if (exam.computationStatus === 'computed') return 'ready';
  if (getAudience(exam) === 'student' && hasEnded(exam)) return 'to_compute';
  return 'pending';
}

// What the panel says about an exam that has no results to show yet
function getNoResultsMessage(exam) {
  if (getAudience(exam) === 'alumni') {
    return "No alumni have submitted an attempt yet. Results show here after the first one, based on each alumni's highest score.";
  }
  if (getResultState(exam) === 'to_compute') {
    return 'This exam has ended. Compute its results to see the scores, the topics and how each question was answered.';
  }
  if (exam.endDateTime) {
    return `Results can be computed once the exam ends on ${formatDateTime(exam.endDateTime)}.`;
  }
  return 'Results can be computed once the exam has been scheduled and has ended.';
}

function getRateTone(rate) {
  if (rate >= 75) return { tone: 'good', text: 'Most got this right' };
  if (rate >= 50) return { tone: 'warn', text: 'Mixed results' };
  return { tone: 'bad', text: 'Most got this wrong' };
}

// The questions of a report in the shape of the shared question views. Their answer choices come
// from the answer counts.
function getReportQuestions(report) {
  if (!report) return [];
  const questions = (report.subjects || []).flatMap((subject) => (subject.questions || []).map((question) => ({
    ...question,
    _id: String(question.questionId),
    subjectName: subject.name,
    answers: (question.answerCounts || []).map((answer) => ({
      _id: answer.answerId,
      text: answer.text,
      image: answer.image,
      isCorrect: answer.isCorrect,
    })),
  })));
  return orderByExamNumber(questions);
}

function getAnswerCountProps(question) {
  return {
    answerCounts: Object.fromEntries(
      (question.answerCounts || []).map((answer) => [String(answer.answerId), answer.count || 0])
    ),
    unansweredCount: question.unansweredCount || 0,
  };
}

// Whether someone on the individual results has a score (the others are eligible but have not
// submitted the exam)
function hasScore(entry) {
  return !entry.status || entry.status === 'taken';
}

// The Excel rows of an alumni exam: each alumni's highest score, then every attempt
function buildAlumniSheetRows(data) {
  const maxAttempts = data.reduce((max, item) => Math.max(max, item.attemptCount || 0), 0);

  return data.map((item) => {
    let status = item.passed ? 'Passed' : 'Failed';
    if (!hasScore(item)) status = item.status === 'in_progress' ? 'In progress' : 'Not taken';

    const row = {
      'Alumni Name': item.student?.name || 'N/A',
      'Alumni Email': item.student?.email || 'N/A',
      'Alumni ID': item.student?.alumniId || item.student?.studentId || 'N/A',
      'Attempt Count': item.attemptCount || 0,
      'Highest Score (%)': hasScore(item) ? (item.overallPercentage || 0) : '',
      Status: status,
    };

    const sortedAttempts = (item.attempts || []).slice().sort((a, b) => {
      if (a.attemptNumber !== undefined && b.attemptNumber !== undefined) {
        return a.attemptNumber - b.attemptNumber;
      }
      return new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0);
    });

    for (let i = 0; i < maxAttempts; i += 1) {
      const attempt = sortedAttempts[i];
      row[`Attempt ${i + 1} Score (%)`] = attempt ? attempt.overallPercentage : '';
      row[`Attempt ${i + 1} Status`] = attempt ? (attempt.passed ? 'Passed' : 'Failed') : '';
    }
    return row;
  });
}

// The Excel rows of a student exam: each student's score and status, the same words as the
// Individual view, then a column per subject
function buildStudentSheetRows(data, examEnded) {
  const subjectNames = [];
  data.forEach((item) => {
    (item.subjectBreakdowns || []).forEach((subject) => {
      if (!subjectNames.includes(subject.subjectName)) subjectNames.push(subject.subjectName);
    });
  });

  return data.map((item) => {
    let status = item.passed ? 'Passed' : 'Failed';
    if (!hasScore(item)) {
      if (item.status === 'in_progress') status = 'In progress';
      else status = examEnded ? 'Did not take' : 'Not taken yet';
    }

    const row = {
      'Student Name': item.student?.name || 'N/A',
      'Student Email': item.student?.email || 'N/A',
      'Student ID': item.student?.studentId || 'N/A',
      'Score (%)': hasScore(item) ? (item.overallPercentage || 0) : '',
      Status: status,
    };

    subjectNames.forEach((name) => {
      const subject = (item.subjectBreakdowns || []).find((entry) => entry.subjectName === name);
      row[`${name} (%)`] = subject ? subject.percentage : '';
    });
    return row;
  });
}

// The labelled values at the bottom of the Overall view, or on their own while there are no results
function getExamFacts(exam, report) {
  const isAlumni = getAudience(exam) === 'alumni';
  return [
    { label: 'Program', value: formatProgramLabel(exam.program) },
    { label: 'Audience', value: isAlumni ? 'Alumni' : 'Students' },
    { label: 'Created By', value: exam.createdBy?.name || '-' },
    { label: 'Created', value: formatDateTime(exam.createdAt) },
    { label: 'Exam Start', value: exam.startDateTime ? formatDateTime(exam.startDateTime) : 'Not scheduled' },
    { label: 'Exam End', value: exam.endDateTime ? formatDateTime(exam.endDateTime) : 'Not scheduled' },
    { label: 'Passing Threshold', value: `${getThreshold(exam)}%` },
    { label: 'Questions', value: plural(exam.questions?.length || 0, 'question') },
    // Alumni results are worked out on each visit, so only student results have a computed date
    isAlumni
      ? { label: 'Latest Attempt', value: formatDateTime(report?.dateConducted) }
      : { label: 'Last Computed', value: formatDateTime(report?.computedAt) },
    { label: 'Exam Status', value: <ExamStatePill status={exam.status} /> },
  ];
}

// How far the average is from the passing threshold, told by an arrow and words, not color alone
function ThresholdGap({ average, threshold }) {
  const gap = average - threshold;
  if (gap === 0) return <span className="ca-stat-sub er-gap is-above">Right at the threshold</span>;

  const isAbove = gap > 0;
  return (
    <span className={`ca-stat-sub er-gap ${isAbove ? 'is-above' : 'is-below'}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d={isAbove ? 'M6 2 11 10H1z' : 'M6 10 1 2h10z'} fill="currentColor" />
      </svg>
      {Math.abs(gap)} {Math.abs(gap) === 1 ? 'pt' : 'pts'} {isAbove ? 'above' : 'below'} the threshold
    </span>
  );
}

// Takers per 10-point score range. A range's bar is split into the takers who passed and those
// below the threshold, and a dashed line marks the threshold on the score axis. Each bar shows its
// count above it, and its range and split on hover or keyboard focus.
function ScoreDistribution({ ranges, threshold, lowest, highest }) {
  const [activeIdx, setActiveIdx] = useState(null);
  if (!ranges?.length) return <p className="ca-hint">No scores to chart yet.</p>;

  const maxCount = Math.max(1, ...ranges.map((range) => range.below + range.passed));

  return (
    <figure className="er-dist">
      <figcaption className="er-dist-legend">
        <span className="er-dist-key"><span className="er-dist-swatch is-passed" />Passed</span>
        <span className="er-dist-key"><span className="er-dist-swatch is-below" />Below threshold</span>
        <span className="er-dist-key"><span className="er-dist-line-key" />Threshold {threshold}%</span>
      </figcaption>

      <div className="er-dist-plot">
        {ranges.map((range, idx) => {
          const count = range.below + range.passed;
          const rangeLabel = `${range.min}–${range.max}%`;
          const split = [
            range.passed > 0 && `${range.passed} passed`,
            range.below > 0 && `${range.below} below ${threshold}%`,
          ].filter(Boolean).join(' · ');
          let tooltipEdge = '';
          if (idx < 2) tooltipEdge = ' is-start';
          else if (idx > ranges.length - 3) tooltipEdge = ' is-end';

          return (
            <div
              key={range.min}
              className={`er-dist-slot${activeIdx === idx ? ' is-active' : ''}`}
              tabIndex={0}
              aria-label={`${rangeLabel}: ${plural(count, 'taker')}${split ? `, ${split}` : ''}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(null)}
              onFocus={() => setActiveIdx(idx)}
              onBlur={() => setActiveIdx(null)}
            >
              {count > 0 && (
                <div className="er-dist-bar" style={{ height: `${(count / maxCount) * 100}%` }}>
                  <b className="er-dist-count">{count}</b>
                  {range.passed > 0 && <span className="er-dist-seg is-passed" style={{ flexGrow: range.passed }} />}
                  {range.below > 0 && <span className="er-dist-seg is-below" style={{ flexGrow: range.below }} />}
                </div>
              )}
              {activeIdx === idx && (
                <div className={`er-dist-tooltip${tooltipEdge}`} role="tooltip">
                  <strong>{plural(count, 'taker')}</strong>
                  <span>{rangeLabel}</span>
                  {split && <span>{split}</span>}
                </div>
              )}
            </div>
          );
        })}
        <div
          className="er-dist-threshold"
          style={{ left: `${Math.min(100, Math.max(0, threshold))}%` }}
          aria-hidden="true"
        />
      </div>

      <div className="er-dist-axis" aria-hidden="true">
        {SCORE_TICKS.map((tick) => (
          <span key={tick} style={{ left: `${tick}%` }}>{tick}</span>
        ))}
      </div>
      <div className="er-dist-foot">
        <span>Score (%)</span>
        <span>Lowest {lowest}% · Highest {highest}%</span>
      </div>
    </figure>
  );
}

const NOTE_ICONS = {
  nearMiss: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  topics: (
    <>
      <path d="M12 4 21 19.5H3z" />
      <path d="M12 10v4M12 16.8v.2" />
    </>
  ),
  retakes: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4.5H15" />
    </>
  ),
};

function SummaryNote({ icon, children }) {
  return (
    <li className="er-note">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {NOTE_ICONS[icon]}
      </svg>
      <span>{children}</span>
    </li>
  );
}

export default function ExamResults({ me }) {
  const { notify } = useToast();
  const isDean = me?.role === 'dean';
  const isProgramChair = me?.role === 'program_chair';

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedAudience, setSelectedAudience] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  // The panel: the open exam, its view, its results once loaded, the question shown, and the image
  // opened full size. The view stays as it is when another exam opens.
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [panelView, setPanelView] = useState('overall');
  // Widened over the list, or covering the whole window
  const panelLayout = usePanelLayout(selectedExamId);
  const [reportState, setReportState] = useState({ examId: null, report: null, error: '' });
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [individual, setIndividual] = useState(NO_INDIVIDUAL);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [computingId, setComputingId] = useState(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  const fetchExams = useCallback(async () => {
    try {
      const data = await listExamsWithStatus();
      let allExams = data.exams || [];
      // Program chairs only see exams for their own program
      if (isProgramChair) {
        const myProgramId = String(me?.program?._id || me?.program || '');
        allExams = allExams.filter((exam) => getProgramId(exam) === myProgramId);
      }
      setExams(allExams);
    } catch (err) {
      console.error('Failed to fetch exams:', err);
      notify(err.message || 'The exams could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isProgramChair, me?.program, notify]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  // The list has everything about an exam except its results. A slow answer for an exam that is no
  // longer open is ignored.
  useEffect(() => {
    if (!selectedExamId) return undefined;
    let ignore = false;

    getExamResult(selectedExamId)
      .then((data) => {
        if (!ignore) setReportState({ examId: selectedExamId, report: data.result || null, error: '' });
      })
      .catch((err) => {
        if (!ignore) {
          setReportState({
            examId: selectedExamId,
            report: null,
            error: err.message || 'The results of this exam could not be loaded.',
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedExamId]);

  const isLoadingReport = Boolean(selectedExamId) && reportState.examId !== selectedExamId;
  const report = isLoadingReport ? null : reportState.report;
  const reportError = isLoadingReport ? '' : reportState.error;

  // An open exam without results checks for them now and then, such as alumni's first attempt
  useEffect(() => {
    if (!selectedExamId || isLoadingReport || report || reportError) return undefined;
    const examId = selectedExamId;

    const timer = setInterval(async () => {
      try {
        const data = await getExamResult(examId);
        if (!data.result) return;
        setReportState((prev) => (prev.examId === examId ? { examId, report: data.result, error: '' } : prev));
        fetchExams();
      } catch {
        // Keep checking quietly while the results are unavailable
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [selectedExamId, isLoadingReport, report, reportError, fetchExams]);

  const loadIndividual = useCallback(async (examId) => {
    setIndividual({ ...NO_INDIVIDUAL, examId, loading: true });
    try {
      const res = await getExamStudentResults(examId);
      setIndividual((prev) => (prev.examId === examId ? {
        examId,
        loading: false,
        error: '',
        students: res.students || [],
        questions: res.questions || {},
        examEnded: Boolean(res.examEnded),
      } : prev));
    } catch (err) {
      setIndividual((prev) => (prev.examId === examId ? {
        ...prev,
        loading: false,
        error: err.message || 'The individual results could not be loaded.',
      } : prev));
    }
  }, []);

  // Each person's results load the first time the Individual view opens for an exam
  useEffect(() => {
    if (panelView !== 'individual' || !report || !selectedExamId) return;
    if (individual.examId !== selectedExamId) loadIndividual(selectedExamId);
  }, [panelView, report, selectedExamId, individual.examId, loadIndividual]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedState, selectedProgramId, selectedAudience, selectedSubject, sortBy]);

  // The list scrolls on its own: each page or filter starts at the top...
  const listScrollRef = useRef(null);
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [currentPage, searchQuery, selectedState, selectedProgramId, selectedAudience, selectedSubject, sortBy]);

  // ...and the open exam's card stays in view when the columns change, once they finish gliding
  useEffect(() => {
    listScrollRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [selectedExamId, currentPage, panelLayout.isExpanded, panelLayout.isGliding]);

  // Windows too short to fit the page scroll it, which can leave the panel partly off screen
  const panelRef = useRef(null);
  useEffect(() => {
    if (!selectedExamId) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selectedExamId]);

  // The Individual view scrolls it when a person opens and closes
  const panelContentRef = useRef(null);

  // Escape closes the image opened full size (before full screen ends: see usePanelLayout)
  useEffect(() => {
    if (!fullscreenImage) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setFullscreenImage(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [fullscreenImage]);

  function handleSelectExam(exam) {
    if (exam._id === selectedExamId) return;
    setSelectedExamId(exam._id);
    setActiveQuestionIdx(0);
  }

  function clearFilters() {
    setSearchQuery('');
    setSelectedState('');
    setSelectedAudience('');
    setSelectedSubject('');
  }

  async function handleCompute(exam) {
    setComputingId(exam._id);
    try {
      const data = await computeExamResult(exam._id, getThreshold(exam));
      setReportState((prev) => (prev.examId === exam._id ? { ...prev, report: data.result || null, error: '' } : prev));
      notify(`Results computed for ${exam.name}.`, { variant: 'success' });
      fetchExams();
    } catch (err) {
      notify(`Computation failed: ${err.message || 'Unknown error'}`, { variant: 'error' });
    } finally {
      setComputingId(null);
    }
  }

  async function handleExportExcel(exam) {
    const isAlumni = getAudience(exam) === 'alumni';
    setExportingExcel(true);
    try {
      const res = await getExamStudentResults(exam._id);
      const data = res.students || [];
      if (data.length === 0) {
        notify(`No ${isAlumni ? 'alumni' : 'student'} results found to export.`, { variant: 'info' });
        return;
      }

      const exportData = isAlumni ? buildAlumniSheetRows(data) : buildStudentSheetRows(data, Boolean(res.examEnded));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, isAlumni ? 'Alumni Results' : 'Student Results');

      const examNameSafe = (report?.examName || exam.name || 'Exam').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      XLSX.writeFile(wb, `${examNameSafe}_${isAlumni ? 'alumni' : 'student'}_results.xlsx`);
      notify('Exported successfully.', { variant: 'success' });
    } catch (err) {
      console.error('Export error:', err);
      notify('Failed to export to Excel.', { variant: 'error' });
    } finally {
      setExportingExcel(false);
    }
  }

  // The panel reads from the list, so a computed result shows on its card straight away
  const selectedExam = useMemo(
    () => (selectedExamId ? exams.find((exam) => exam._id === selectedExamId) || null : null),
    [exams, selectedExamId]
  );

  const programOptions = useMemo(() => {
    const byId = new Map();
    exams.forEach((exam) => {
      const programId = getProgramId(exam);
      if (!programId || byId.has(programId)) return;
      byId.set(programId, {
        _id: programId,
        name: exam.program?.name || `Program ${programId.slice(-6)}`,
        code: exam.program?.code,
      });
    });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [exams]);

  const programExams = useMemo(() => (
    selectedProgramId ? exams.filter((exam) => getProgramId(exam) === selectedProgramId) : exams
  ), [exams, selectedProgramId]);

  const subjectOptions = useMemo(() => {
    const byKey = new Map();
    programExams.forEach((exam) => {
      getNamedSubjects(exam).forEach((tag) => {
        const key = subjectKey(tag);
        if (key && !byKey.has(key)) byKey.set(key, tag.name);
      });
    });
    return Array.from(byKey, ([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  }, [programExams]);

  useEffect(() => {
    if (selectedSubject && !subjectOptions.some((option) => option.id === selectedSubject)) {
      setSelectedSubject('');
    }
  }, [subjectOptions, selectedSubject]);

  const filteredExceptState = useMemo(() => {
    let filtered = programExams;
    const query = searchQuery.trim().toLowerCase();
    if (query) filtered = filtered.filter((exam) => (exam.name || '').toLowerCase().includes(query));
    if (selectedAudience) filtered = filtered.filter((exam) => getAudience(exam) === selectedAudience);
    if (selectedSubject) {
      filtered = filtered.filter((exam) => getNamedSubjects(exam).some((tag) => subjectKey(tag) === selectedSubject));
    }
    return filtered;
  }, [programExams, searchQuery, selectedAudience, selectedSubject]);

  const stateCounts = useMemo(() => {
    const counts = { all: filteredExceptState.length };
    filteredExceptState.forEach((exam) => {
      const state = getResultState(exam);
      counts[state] = (counts[state] || 0) + 1;
    });
    return counts;
  }, [filteredExceptState]);

  // Newest is the latest exam date first; exams without a date go last either way
  const visibleExams = useMemo(() => {
    const listed = selectedState
      ? filteredExceptState.filter((exam) => getResultState(exam) === selectedState)
      : filteredExceptState;
    const examTime = (exam) => (exam.startDateTime ? new Date(exam.startDateTime).getTime() : null);
    return [...listed].sort((a, b) => {
      const timeA = examTime(a);
      const timeB = examTime(b);
      if (timeA === null || timeB === null) return (timeA === null) - (timeB === null);
      return sortBy === 'oldest' ? timeA - timeB : timeB - timeA;
    });
  }, [filteredExceptState, selectedState, sortBy]);

  const hasActiveFilters = Boolean(searchQuery.trim() || selectedState || selectedAudience || selectedSubject);
  const totalPages = Math.ceil(visibleExams.length / ITEMS_PER_PAGE) || 1;
  const paginatedExams = visibleExams.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const threshold = getThreshold(selectedExam);
  const isAlumniExam = getAudience(selectedExam) === 'alumni';
  const audienceNoun = isAlumniExam ? 'alumni' : 'students';
  const reportQuestions = useMemo(() => getReportQuestions(report), [report]);

  const summary = useMemo(() => {
    if (!report) return null;
    const takers = report.totalTakers || 0;
    const totalEligible = report.totalEligibleStudents || 0;
    const passedCount = report.passedCount || 0;
    return {
      overallAvg: report.overallAverageScore ?? 0,
      highestScore: report.highestScore ?? 0,
      lowestScore: report.lowestScore ?? 0,
      takers,
      totalEligible,
      // Share of the eligible students (or alumni) who took it, when the counts add up
      participation: totalEligible > 0 && takers <= totalEligible ? Math.round((takers / totalEligible) * 100) : null,
      passedCount,
      passRate: takers > 0 ? Math.round((passedCount / takers) * 100) : 0,
      nearMissCount: report.nearMissCount || 0,
      scoreDistribution: report.scoreDistribution || [],
      totalAttempts: report.totalAttempts || 0,
      retakes: report.retakes || null,
    };
  }, [report]);

  const topics = useMemo(() => (report?.subjects || []).map((subject) => ({
    key: subject.name,
    name: subject.name,
    correct: subject.correctCount,
    total: subject.totalItems,
    percentage: subject.averageScore,
  })), [report]);

  // Topics under the threshold, lowest first
  const weakTopics = useMemo(
    () => topics.filter((topic) => topic.percentage < threshold).sort((a, b) => a.percentage - b.percentage),
    [topics, threshold]
  );

  // A topic row opens the Questions view on that topic's first question
  function showTopicQuestions(topic) {
    const index = reportQuestions.findIndex((question) => question.subjectName === topic.name);
    setActiveQuestionIdx(Math.max(index, 0));
    setPanelView('questions');
  }

  function renderExamCard(exam, cardIndex) {
    const subjects = getNamedSubjects(exam);
    const audience = getAudience(exam);
    const questionCount = exam.questions?.length || 0;
    const state = getResultState(exam);

    return (
      <div
        key={exam._id}
        className={`ca-question-card ${exam._id === selectedExamId ? 'is-active' : ''}`}
        style={{ '--card-index': cardIndex }}
        onClick={() => handleSelectExam(exam)}
      >
        <div className="ca-card-top">
          {/* Its click bubbles up to the card, so keyboard users can open the card too */}
          <button type="button" className="ca-card-open">
            <span className="ca-card-title">{exam.name}</span>
          </button>
          <div className="ca-card-markers">
            <Marker className="ca-marker--count" label={plural(questionCount, 'question')}>{questionCount}</Marker>
            <Marker className="ca-marker--audience" label={AUDIENCE_LABELS[audience]}>
              <AudienceMarkerIcon audience={audience} />
            </Marker>
            <Marker className={`er-result--${state}`} label={`Results: ${RESULT_STATES[state].label}`}>
              <MarkerIcon>{RESULT_STATES[state].icon}</MarkerIcon>
            </Marker>
          </div>
        </div>
        <div className="ca-card-meta">
          {isDean && <span className="ca-program-pill">{formatProgramLabel(exam.program)}</span>}
          {subjects.length > 0 && <span className="ca-tag-pill">{subjects[0].name}</span>}
          {subjects.length > 1 && (
            <span className="ca-tag-pill" title={subjects.slice(1).map((tag) => tag.name).join(', ')}>
              +{subjects.length - 1}
            </span>
          )}
          <span className="ca-card-meta-datetime">
            {exam.startDateTime ? (
              <>
                <span className="ca-date">{formatDate(exam.startDateTime)}</span>
                <span className="ca-time">{formatTime(exam.startDateTime)}</span>
              </>
            ) : (
              <span className="ca-date">Not scheduled</span>
            )}
          </span>
        </div>
      </div>
    );
  }

  function renderFacts(exam) {
    return (
      <section className="ca-section ca-review-metadata">
        <div className="ca-meta-grid">
          {getExamFacts(exam, report).map(({ label, value }) => (
            <div key={label}>
              <span className="ca-meta-label">{label}</span>
              <div className="ca-meta-value">{value}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderOverallView(exam) {
    return (
      <>
        <section className="question-panel">
          <p className="question-panel-label">Summary</p>
          {isAlumniExam && <p className="ca-hint ca-hint--section">Based on each alumni&apos;s highest score.</p>}
          <div className="ca-stats">
            <div className="ca-stat">
              <span className="ca-stat-label">Passed</span>
              <strong className="ca-stat-value">{summary.passRate}%</strong>
              <span className="ca-stat-sub">{summary.passedCount} of {plural(summary.takers, 'taker')}</span>
            </div>
            <div className="ca-stat">
              <span className="ca-stat-label">Average score</span>
              <strong className="ca-stat-value">{summary.overallAvg}%</strong>
              <ThresholdGap average={summary.overallAvg} threshold={threshold} />
            </div>
            <div className="ca-stat">
              <span className="ca-stat-label">Took the exam</span>
              <strong className="ca-stat-value">
                {summary.participation !== null ? `${summary.participation}%` : summary.takers}
              </strong>
              <span className="ca-stat-sub">
                {summary.participation !== null
                  ? `${summary.takers} of ${summary.totalEligible} eligible ${audienceNoun}`
                  : `Eligible ${audienceNoun} count unavailable`}
              </span>
            </div>
          </div>
          <ul className="er-notes">
            <SummaryNote icon="nearMiss">
              {summary.nearMissCount > 0 ? (
                <>
                  <strong>{plural(summary.nearMissCount, 'taker')}</strong>
                  {summary.nearMissCount === 1 ? ' is' : ' are'} within {NEAR_MISS_POINTS} points of passing.
                </>
              ) : `No taker is within ${NEAR_MISS_POINTS} points of passing.`}
            </SummaryNote>
            <SummaryNote icon="topics">
              {weakTopics.length > 0 ? (
                <>
                  Needs attention:{' '}
                  {weakTopics.slice(0, 3).map((topic, idx) => (
                    <Fragment key={topic.key}>
                      {idx > 0 && ' · '}
                      <strong>{topic.name}</strong> {topic.percentage}%
                    </Fragment>
                  ))}
                  {weakTopics.length > 3 && ` · ${weakTopics.length - 3} more below the threshold`}
                </>
              ) : 'Every topic is at or above the threshold.'}
            </SummaryNote>
            {isAlumniExam && summary.retakes && (
              <SummaryNote icon="retakes">
                {summary.retakes.retakers > 0 ? (
                  <>
                    <strong>{summary.retakes.improved} of {summary.retakes.retakers}</strong> alumni who retook it
                    raised their score ({plural(summary.totalAttempts, 'attempt')} in all).
                  </>
                ) : `No retakes yet (${plural(summary.totalAttempts, 'attempt')} in all).`}
              </SummaryNote>
            )}
          </ul>
        </section>

        <section className="question-panel">
          <p className="question-panel-label">Score Distribution</p>
          <div className="question-panel-body">
            <ScoreDistribution
              ranges={summary.scoreDistribution}
              threshold={threshold}
              lowest={summary.lowestScore}
              highest={summary.highestScore}
            />
          </div>
        </section>

        <section className="question-panel">
          <p className="question-panel-label">Scores by Topic</p>
          {topics.length > 0 ? (
            <TopicScoreRows
              topics={topics}
              threshold={threshold}
              onSelect={showTopicQuestions}
              selectLabel={(topic) => `Show the questions of ${topic.name}`}
            />
          ) : (
            <p className="ca-hint ca-hint--section">This exam has no topics to break down.</p>
          )}
        </section>

        {renderFacts(exam)}
      </>
    );
  }

  function renderQuestionsView() {
    if (reportQuestions.length === 0) return <p className="ca-panel-note">These results have no questions to show.</p>;

    return (
      <QuestionStepper
        questions={reportQuestions}
        activeIdx={activeQuestionIdx}
        onSelectQuestion={setActiveQuestionIdx}
        onZoom={setFullscreenImage}
        getPanelProps={getAnswerCountProps}
        renderAside={(question) => {
          const { tone, text } = getRateTone(question.correctRate || 0);
          return (
            <span className="er-aside">
              <span className="ca-tag-pill">{question.subjectName || 'No subject'}</span>
              <span className={`ca-tone-pill ca-tone-pill--${tone}`} title={text}>{question.correctRate || 0}% correct</span>
            </span>
          );
        }}
      />
    );
  }

  function renderPanelContent(exam) {
    if (isLoadingReport) return <p className="ca-panel-note">Loading results...</p>;
    if (reportError) return <p className="ca-panel-note ca-panel-note--error" role="alert">{reportError}</p>;
    if (!report) {
      return (
        <>
          <p className="ca-panel-note er-no-results">{getNoResultsMessage(exam)}</p>
          {renderFacts(exam)}
        </>
      );
    }
    if (panelView === 'questions') return renderQuestionsView();
    if (panelView === 'individual') {
      return (
        <IndividualReportView
          data={individual.examId === exam._id ? individual : { ...NO_INDIVIDUAL, loading: true }}
          threshold={threshold}
          audience={getAudience(exam)}
          onRefresh={() => loadIndividual(exam._id)}
          onZoom={setFullscreenImage}
          scrollRef={panelContentRef}
        />
      );
    }
    return renderOverallView(exam);
  }

  function renderPanelActions(exam) {
    const canCompute = !report && !isLoadingReport && getResultState(exam) === 'to_compute';
    const canExport = Boolean(report);
    if (!canCompute && !canExport) return null;

    const isComputing = computingId === exam._id;
    return (
      <div className="ca-sidebar-actions">
        {canCompute && (
          <button
            type="button"
            className="ca-btn ca-btn--approve"
            onClick={() => handleCompute(exam)}
            disabled={isComputing}
          >
            {isComputing ? 'Computing results...' : 'Compute Results'}
          </button>
        )}
        {canExport && (
          <button
            type="button"
            className="ca-btn ca-btn--edit"
            onClick={() => handleExportExcel(exam)}
            disabled={exportingExcel}
            title={`Download the ${getAudience(exam) === 'alumni' ? 'alumni' : 'student'} results of this exam as an Excel file (.xlsx)`}
          >
            {exportingExcel ? 'Preparing file...' : 'Download Excel (.xlsx)'}
          </button>
        )}
      </div>
    );
  }

  return (
    <main className="er-page ca-page ca-page--stepper page-shell">
      <PageHeader
        title="Mock Board Exam Results"
        subtitle="Compute and review each exam's results: scores, topics, questions and every taker."
      >
        {isProgramChair && <span className="ca-program-chip">{me?.program?.name || 'Your Program'}</span>}
      </PageHeader>

      <CapsuleFilters
        className="ca-state-pills"
        ariaLabel="Filter exams by their results"
        options={STATE_TABS.map((tab) => ({
          value: tab.value,
          label: tab.label,
          count: tab.value ? (stateCounts[tab.value] || 0) : stateCounts.all,
        }))}
        value={selectedState}
        onChange={setSelectedState}
      />

      <QuestionFilters
        className="ca-filters-wrapper"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search exams by name..."
        role={me?.role}
        subjectFilter={selectedSubject}
        onSubjectChange={setSelectedSubject}
        subjectOptions={subjectOptions}
        programFilter={selectedProgramId}
        onProgramChange={setSelectedProgramId}
        programOptions={programOptions}
        sortBy={sortBy}
        onSortChange={setSortBy}
        extraFilters={(
          <DropdownSelect
            className="er-filter-audience"
            value={selectedAudience}
            onChange={(event) => setSelectedAudience(event.target.value)}
            ariaLabel="Filter exams by audience"
            placeholder="Filter: All Audiences"
            options={[
              { value: 'student', label: 'Student Exams' },
              { value: 'alumni', label: 'Alumni Exams' },
            ]}
          />
        )}
      />

      <div className={panelLayout.layoutClass(Boolean(selectedExam))} onTransitionEnd={panelLayout.onLayoutTransitionEnd}>
        <section className="ca-list-panel" aria-label="Exams">
          <MarkerLegend items={LEGEND_ITEMS} ariaLabel="What the exam markers mean" />

          <div className="ca-list-scroll" ref={listScrollRef}>
            {loading ? (
              <div className="ca-empty">Loading exams...</div>
            ) : visibleExams.length === 0 ? (
              <div className="ca-empty">
                <p className="er-empty-text">
                  {exams.length === 0
                    ? 'No mock board exams yet. Exams created for your programs will appear here.'
                    : 'No exams match your filters.'}
                </p>
                {exams.length > 0 && hasActiveFilters && (
                  <button type="button" className="ca-btn er-clear-filters" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              /* Keyed so the cards animate in for each new view, but not while typing a search */
              <div
                className="ca-questions-list"
                key={[selectedState, selectedSubject, selectedAudience, selectedProgramId, sortBy, currentPage].join('|')}
              >
                {paginatedExams.map(renderExamCard)}
              </div>
            )}
          </div>

          {!loading && (
            <Pagination
              currentPage={currentPage}
              totalItems={visibleExams.length}
              pageSize={ITEMS_PER_PAGE}
              onPageChange={setCurrentPage}
              itemLabel={visibleExams.length === 1 ? 'exam' : 'exams'}
              classPrefix="ca"
              maxPageButtons={5}
            />
          )}
        </section>

        {selectedExam ? (
          <div className={panelLayout.sidebarClass} ref={panelRef}>
            <PanelHeader
              title={selectedExam.name}
              views={report ? PANEL_VIEWS : []}
              view={panelView}
              onViewChange={setPanelView}
              isExpanded={panelLayout.isExpanded}
              onToggleExpanded={panelLayout.toggleExpanded}
              isFullscreen={panelLayout.isFullscreen}
              onToggleFullscreen={panelLayout.toggleFullscreen}
              onClose={() => setSelectedExamId(null)}
              closeLabel="Close exam panel"
            />

            {/* Keyed so each exam and each view starts scrolled to the top */}
            <div
              className="ca-sidebar-content"
              key={`${selectedExam._id}-${report ? panelView : 'none'}`}
              ref={panelContentRef}
            >
              {renderPanelContent(selectedExam)}
            </div>

            {renderPanelActions(selectedExam)}
          </div>
        ) : (
          <div className="ca-sidebar ca-sidebar--empty">
            <p>Select an exam to view its results</p>
          </div>
        )}
      </div>

      {fullscreenImage && (
        <div
          className="ca-image-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="ca-image-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="ca-image-close" onClick={() => setFullscreenImage(null)}>Close</button>
            <AuthImage src={fullscreenImage} alt="Question preview" className="ca-image-full" />
          </div>
        </div>
      )}
    </main>
  );
}
