import React, { useEffect, useState, useMemo, memo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { listExamsWithStatus, getExamResult, computeExamResult, getExamStudentResults } from '../../services/mockExamResultService';
import '../../styles/shared/ExamResults.css';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import ResultQuestionList from '../../components/ResultQuestionList.jsx';
import SearchBar from '../../components/SearchBar.jsx';
import { useToast } from '../../components/Toast.jsx';
import IndividualReportView from "./IndividualReportView.jsx";

const EXAMS_PER_PAGE = 5;
// A taker this many points or fewer under the threshold "nearly passed" (same as the server)
const NEAR_MISS_POINTS = 5;
const SCORE_TICKS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const getStatusClass = (avg, threshold) => {
  if (avg >= threshold) return 'green';
  if (avg >= threshold * 0.7) return 'orange';
  return 'red';
};

const getQuestionTagInfo = (rate) => {
  if (rate >= 75) return { text: 'Most got this right', className: 'tag-green' };
  if (rate >= 50) return { text: 'Mixed results', className: 'tag-yellow' };
  return { text: 'Most got this wrong', className: 'tag-red' };
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

const formatShortDate = (dateStr) => {
  if (!dateStr) return 'No date';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const getComputationLabel = (exam) => {
  if (exam.computationStatus === 'computed') return 'Ready';
  if ((exam.targetAudience || 'student') === 'alumni') return 'No attempts';
  if (exam.status === 'finished') return 'Ready to compute';
  return 'Pending';
};

const getComputationTone = (exam) => {
  if (exam.computationStatus === 'computed') return 'ready';
  if (exam.status === 'finished') return 'action';
  return 'pending';
};

const getAudienceLabel = (exam) => ((exam.targetAudience || 'student') === 'alumni' ? 'Alumni' : 'Students');

// A report question in the shape of the shared question views. Its answer choices
// come from the answer counts
const toReportQuestion = (question) => ({
  ...question,
  answers: (question.answerCounts || []).map((answer) => ({
    _id: answer.answerId,
    text: answer.text,
    image: answer.image,
    isCorrect: answer.isCorrect,
  })),
});

// How the takers did on a question, on its card
const renderQuestionRate = (question) => {
  const tagInfo = getQuestionTagInfo(question.correctRate);
  const takers = (question.answerCounts || []).reduce((sum, answer) => sum + (answer.count || 0), 0)
    + (question.unansweredCount || 0);

  return (
    <>
      <span className={`er-q-tag ${tagInfo.className}`}>{tagInfo.text}</span>
      <span className="rql-meta-text">{question.correctRate}% correct | {takers} takers</span>
    </>
  );
};

const renderSetRate = (questions) => {
  const average = Math.round(questions.reduce((sum, question) => sum + (question.correctRate || 0), 0) / questions.length);
  return <span className="rql-meta-text">{average}% correct</span>;
};

const getAnswerCountProps = (question) => ({
  answerCounts: Object.fromEntries(
    (question.answerCounts || []).map((answer) => [String(answer.answerId), answer.count || 0])
  ),
  unansweredCount: question.unansweredCount || 0,
});

const TopicRow = memo(({ subject, isExpanded, onToggle }) => {
  const status = getStatusClass(subject.averageScore, subject.threshold);
  const questions = useMemo(() => (subject.questions || []).map(toReportQuestion), [subject.questions]);

  return (
    <div className="er-topic-wrapper">
      <button type="button" className="er-topic-row" onClick={onToggle}>
        <div className="er-topic-main">
          <div className={`er-topic-name status-${status}`}>{subject.name}</div>
          <div className="er-topic-mini-meta">
            <span>{subject.correctCount}/{subject.totalItems} correct</span>
          </div>
        </div>

        <div className="er-topic-bar-col">
          <div className="er-topic-bar-bg">
            <div
              className={`er-topic-bar-fill bg-${status}`}
              style={{ width: `${subject.averageScore}%` }}
            />
          </div>
        </div>

        <div className="er-topic-score-group">
          <div className={`er-topic-pct status-${status}`}>{subject.averageScore}%</div>
          <div className="er-topic-fraction">{subject.correctCount}/{subject.totalItems}</div>
        </div>

        <div className={`er-chevron ${isExpanded ? 'expanded' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="er-questions-list">
          <ResultQuestionList
            questions={questions}
            renderMeta={renderQuestionRate}
            renderSetMeta={renderSetRate}
            getPanelProps={getAnswerCountProps}
          />
        </div>
      )}
    </div>
  );
});

const EmptyStatePanel = ({ eyebrow, title, message, action, children, compact = false }) => (
  <section className={`er-empty-state-card ${compact ? 'compact' : ''}`}>
    {eyebrow && <span className="er-empty-eyebrow">{eyebrow}</span>}
    <h2 className="er-empty-title">{title}</h2>
    <p className="er-empty-message">{message}</p>
    {children}
    {action}
  </section>
);

const SidebarExamItem = memo(({ exam, isActive, onSelect }) => {
  const tone = getComputationTone(exam);

  return (
    <div
      className={`er-sidebar-item ${isActive ? 'active' : ''}`}
      onClick={() => onSelect(exam._id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(exam._id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="er-sidebar-item-top">
        <div>
          <div className="er-side-name">{exam.name}</div>
          <div className="er-side-meta">{formatShortDate(exam.startDateTime)}</div>
        </div>
        <span className={`er-status-pill tone-${tone}`}>{getComputationLabel(exam)}</span>
      </div>

      <div className="er-sidebar-item-bottom">
        <span className="er-side-threshold">Threshold {exam.passingThreshold ?? 70}%</span>
        <span className="er-side-threshold">{getAudienceLabel(exam)}</span>
      </div>
    </div>
  );
});

// How far the average is from the passing threshold, told by an arrow and words, not color alone
const ThresholdGap = ({ average, threshold }) => {
  const gap = average - threshold;
  if (gap === 0) return <span className="er-hero-delta is-above">Right at the threshold</span>;

  const isAbove = gap > 0;
  return (
    <span className={`er-hero-delta ${isAbove ? 'is-above' : 'is-below'}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d={isAbove ? 'M6 2 11 10H1z' : 'M6 10 1 2h10z'} fill="currentColor" />
      </svg>
      {Math.abs(gap)} {Math.abs(gap) === 1 ? 'pt' : 'pts'} {isAbove ? 'above' : 'below'} the threshold
    </span>
  );
};

// Takers per 10-point score range. A range's bar is split into the takers who passed and
// those below the threshold, and a dashed line marks the threshold on the score axis.
// Each bar shows its count above it, and its range and split on hover or keyboard focus
const ScoreDistribution = ({ ranges, threshold, lowest, highest }) => {
  const [activeIdx, setActiveIdx] = useState(null);
  if (!ranges?.length) return null;

  const maxCount = Math.max(1, ...ranges.map((range) => range.below + range.passed));

  return (
    <figure className="er-dist">
      <figcaption className="er-dist-head">
        <span className="er-dist-title">Score distribution</span>
        <span className="er-dist-legend">
          <span className="er-dist-key"><span className="er-dist-swatch is-passed" />Passed</span>
          <span className="er-dist-key"><span className="er-dist-swatch is-below" />Below threshold</span>
          <span className="er-dist-key"><span className="er-dist-line-key" />Threshold {threshold}%</span>
        </span>
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
};

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

const HeroNote = ({ icon, children }) => (
  <li className="er-hero-note">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NOTE_ICONS[icon]}
    </svg>
    <span>{children}</span>
  </li>
);

const ReportTabToggle = ({ activeTab, onChange, showIndividual = true }) => (
  <div className="er-report-tab-toggle">
    <button 
      className={`er-tab-btn ${activeTab === 'overall' ? 'active' : ''}`}
      onClick={() => onChange('overall')}
    >
      Overall
    </button>
    {showIndividual && (
      <button
        className={`er-tab-btn ${activeTab === 'individual' ? 'active' : ''}`}
        onClick={() => onChange('individual')}
      >
        Individual
      </button>
    )}
  </div>
);

const ExamResults = ({ me }) => {
  const { notify } = useToast();
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [activeReport, setActiveReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [computingId, setComputingId] = useState(null);
  const [threshold, setThreshold] = useState(70);
  const [expandedSubjectName, setExpandedSubjectName] = useState(null);
  
  const isProgramChair = me?.role === 'program_chair';
  const userProgramId = me?.program?._id || me?.program;
  const initialProgramId = isProgramChair && userProgramId ? String(userProgramId) : 'all';
  
  const [selectedProgramId, setSelectedProgramId] = useState(initialProgramId);
  const [selectedAudience, setSelectedAudience] = useState('all');
  const [examSearch, setExamSearch] = useState('');
  const [sidebarPage, setSidebarPage] = useState(1);
  const [activeTab, setActiveTab] = useState('overall');
  const [exportingExcel, setExportingExcel] = useState(false);

  const handleExportExcel = async () => {
    if (!selectedExamId) return;
    setExportingExcel(true);
    try {
      const res = await getExamStudentResults(selectedExamId);
      const data = res.students || [];
      if (data.length === 0) {
        notify('No alumni results found to export.', { variant: 'info' });
        return;
      }

      const maxAttempts = data.reduce((max, item) => Math.max(max, item.attemptCount || 0), 0);

      const exportData = data.map(item => {
        // Eligible alumni without a submitted attempt have no score
        const hasScore = !item.status || item.status === 'taken';
        let status = item.passed ? 'Passed' : 'Failed';
        if (!hasScore) status = item.status === 'in_progress' ? 'In progress' : 'Not taken';

        const row = {
          'Alumni Name': item.student?.name || 'N/A',
          'Alumni Email': item.student?.email || 'N/A',
          'Alumni ID': item.student?.alumniId || item.student?.studentId || 'N/A',
          'Attempt Count': item.attemptCount || 0,
          'Highest Score (%)': hasScore ? (item.overallPercentage || 0) : '',
          'Status': status,
        };

        const sortedAttempts = (item.attempts || []).slice().sort((a, b) => {
          if (a.attemptNumber !== undefined && b.attemptNumber !== undefined) {
            return a.attemptNumber - b.attemptNumber;
          }
          return new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0);
        });

        for (let i = 0; i < maxAttempts; i++) {
          const attempt = sortedAttempts[i];
          if (attempt) {
            row[`Attempt ${i + 1} Score (%)`] = attempt.overallPercentage;
            row[`Attempt ${i + 1} Status`] = attempt.passed ? 'Passed' : 'Failed';
          } else {
            row[`Attempt ${i + 1} Score (%)`] = '';
            row[`Attempt ${i + 1} Status`] = '';
          }
        }
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Alumni Results");
      
      const examNameSafe = (activeReport?.examName || 'Exam').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      XLSX.writeFile(wb, `${examNameSafe}_alumni_results.xlsx`);
      notify('Exported successfully.', { variant: 'success' });
    } catch (err) {
      console.error('Export error:', err);
      notify('Failed to export to Excel.', { variant: 'error' });
    } finally {
      setExportingExcel(false);
    }
  };

  const fetchExams = useCallback(async () => {
    try {
      const data = await listExamsWithStatus();
      let allExams = data.exams || [];
      // Program chairs only see exams for their own program
      if (me?.role === 'program_chair') {
        const myProgramId = me?.program?._id || me?.program;
        allExams = allExams.filter((e) => String(e.program?._id || e.program) === String(myProgramId));
      }
      setExams(allExams);
    } catch (err) {
      console.error('Failed to fetch exams:', err);
    } finally {
      setLoading(false);
    }
  }, [me?.role, me?.program]);

  const handleViewReport = useCallback(async (examId) => {
    setSelectedExamId(examId);
    setLoading(true);

    const exam = exams.find((item) => item._id === examId);
    if (exam && exam.passingThreshold !== undefined && exam.passingThreshold !== null) {
      setThreshold(exam.passingThreshold);
    }

    try {
      const data = await getExamResult(examId);
      setActiveReport(data.result || null);
      setExpandedSubjectName(null);
      setActiveTab('overall');
    } catch (err) {
      setActiveReport(null);
      console.warn('Could not load report:', err.message);
    } finally {
      setLoading(false);
    }
  }, [exams]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  useEffect(() => {
    if (!selectedExamId || (activeReport && activeReport.status === 'computed')) return;

    const pollInterval = setInterval(async () => {
      try {
        const data = await getExamResult(selectedExamId);
        if (data.result) {
          setActiveReport(data.result);
          fetchExams();
        }
      } catch (err) {
        // Keep polling quietly while a report is still unavailable.
      }
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [selectedExamId, activeReport?.status, fetchExams]);

  const handleCompute = async (examId) => {
    setComputingId(examId);
    try {
      const data = await computeExamResult(examId, threshold);
      fetchExams();
      if (selectedExamId === examId) setActiveReport(data.result);
    } catch (err) {
      notify('Computation failed: ' + (err.message || 'Unknown error'), { variant: 'error' });
    } finally {
      setComputingId(null);
    }
  };

  const selectedExam = useMemo(
    () => exams.find((exam) => exam._id === selectedExamId) || null,
    [exams, selectedExamId]
  );

  const programs = useMemo(() => {
    const programMap = new Map();

    exams.forEach((exam) => {
      const programId = exam.program?._id || exam.program;
      if (!programId || programMap.has(String(programId))) return;

      programMap.set(String(programId), {
        _id: String(programId),
        name: exam.program?.name || exam.program?.code || `Program ${String(programId).slice(-6)}`,
      });
    });

    return [...programMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [exams]);

  const filteredExams = useMemo(() => {
    let next = exams;
    if (selectedProgramId !== 'all') {
      next = next.filter((exam) => String(exam.program?._id || exam.program) === String(selectedProgramId));
    }
    if (selectedAudience !== 'all') {
      next = next.filter((exam) => (exam.targetAudience || 'student') === selectedAudience);
    }
    return next;
  }, [exams, selectedProgramId, selectedAudience]);

  const searchedExams = useMemo(() => {
    const query = examSearch.trim().toLowerCase();
    if (!query) return filteredExams;
    return filteredExams.filter((exam) => (exam.name || '').toLowerCase().includes(query));
  }, [filteredExams, examSearch]);

  useEffect(() => {
    setSidebarPage(1);
  }, [selectedProgramId, selectedAudience, examSearch]);

  const pagedExams = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(searchedExams.length / EXAMS_PER_PAGE));
    const page = Math.min(sidebarPage, totalPages);
    return searchedExams.slice((page - 1) * EXAMS_PER_PAGE, page * EXAMS_PER_PAGE);
  }, [searchedExams, sidebarPage]);

  const examStats = useMemo(() => {
    const total = filteredExams.length;
    const studentExams = filteredExams.filter((exam) => (exam.targetAudience || 'student') === 'student');
    const ready = studentExams.filter((exam) => exam.computationStatus === 'computed').length;
    const readyToCompute = studentExams.filter((exam) => exam.computationStatus !== 'computed' && exam.status === 'finished').length;
    return { total, ready, readyToCompute };
  }, [filteredExams]);

  useEffect(() => {
    if (!selectedExamId) return;
    const selectedStillVisible = filteredExams.some((exam) => exam._id === selectedExamId);
    if (!selectedStillVisible) {
      setSelectedExamId(null);
      setActiveReport(null);
      setExpandedSubjectName(null);
    }
  }, [filteredExams, selectedExamId]);

  const enrichedSubjects = useMemo(() => {
    if (!activeReport) return [];
    return activeReport.subjects.map((subject) => ({
      ...subject,
      threshold
    }));
  }, [activeReport, threshold]);

  const summary = useMemo(() => {
    if (!activeReport) return null;

    const takers = activeReport.totalTakers || 0;
    const totalEligible = activeReport.totalEligibleStudents || 0;
    const passedCount = activeReport.passedCount || 0;

    return {
      overallAvg: activeReport.overallAverageScore ?? 0,
      highestScore: activeReport.highestScore ?? 0,
      lowestScore: activeReport.lowestScore ?? 0,
      takers,
      totalEligible,
      // Share of the eligible students (or alumni) who took it, when the counts add up
      participation: totalEligible > 0 && takers <= totalEligible ? Math.round((takers / totalEligible) * 100) : null,
      passedCount,
      passRate: takers > 0 ? Math.round((passedCount / takers) * 100) : 0,
      nearMissCount: activeReport.nearMissCount || 0,
      scoreDistribution: activeReport.scoreDistribution || [],
      totalAttempts: activeReport.totalAttempts || 0,
      retakes: activeReport.retakes || null,
      date: formatShortDate(activeReport.dateConducted),
      computedAt: formatDateTime(activeReport.computedAt)
    };
  }, [activeReport]);

  // Topics under the threshold, lowest first
  const weakSubjects = useMemo(
    () => enrichedSubjects
      .filter((subject) => subject.averageScore < threshold)
      .sort((a, b) => a.averageScore - b.averageScore),
    [enrichedSubjects, threshold]
  );

  const isAlumniReport = activeReport?.targetAudience === 'alumni';
  const audienceNoun = isAlumniReport ? 'alumni' : 'students';

  return (
    <div className="er-page page-shell">
      <PageHeader
        title="Mock Board Exam Results"
        subtitle="Review computed analytics, pending exams, and topic-level performance in one place."
      />

      <div className="er-layout">
        <aside className="er-sidebar">
          <div className="er-sidebar-card">
            <div className="er-sidebar-header">
              <div>
                <h3>Exams</h3>
                <p>Choose an exam to inspect or compute results.</p>
              </div>
              <div className="er-sidebar-count">{examStats.total}</div>
            </div>

            <div className="er-sidebar-summary">
              <div className="er-sidebar-summary-card">
                <span className="er-summary-label">Computed</span>
                <strong>{examStats.ready}</strong>
              </div>
              <div className="er-sidebar-summary-card">
                <span className="er-summary-label">To compute</span>
                <strong>{examStats.readyToCompute}</strong>
              </div>
            </div>

            <div className="er-program-filter">
              <span>Search</span>
              <SearchBar
                value={examSearch}
                onChange={setExamSearch}
                placeholder="Search exams by name..."
                className="er-sidebar-search"
              />
            </div>

            <label className="er-program-filter">
              <span>Program</span>
              <select
                value={selectedProgramId}
                onChange={(event) => setSelectedProgramId(event.target.value)}
                disabled={isProgramChair}
              >
                <option value="all">All programs</option>
                {programs.map((program) => (
                  <option key={program._id} value={program._id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="er-program-filter">
              <span>Exam Audience</span>
              <select
                value={selectedAudience}
                onChange={(event) => setSelectedAudience(event.target.value)}
              >
                <option value="all">All Audiences</option>
                <option value="student">Student Exams</option>
                <option value="alumni">Alumni Exams</option>
              </select>
            </label>

            <div className="er-sidebar-scroll">
              {!loading && filteredExams.length === 0 && (
                <EmptyStatePanel
                  compact
                  eyebrow="No Exams"
                  title="No exam records yet"
                  message="Once mock board exams are created, they will appear here for analysis."
                />
              )}

              {!loading && filteredExams.length > 0 && searchedExams.length === 0 && (
                <EmptyStatePanel
                  compact
                  eyebrow="No Matches"
                  title="No exams match your search"
                  message="Try another exam name, or clear the search to see every exam."
                />
              )}

              {pagedExams.map((exam) => (
                <SidebarExamItem
                  key={exam._id}
                  exam={exam}
                  isActive={selectedExamId === exam._id}
                  onSelect={handleViewReport}
                />
              ))}
            </div>

            {searchedExams.length > EXAMS_PER_PAGE && (
              <Pagination
                currentPage={sidebarPage}
                totalItems={searchedExams.length}
                pageSize={EXAMS_PER_PAGE}
                onPageChange={setSidebarPage}
                itemLabel="exams"
                classPrefix="er-side"
                maxPageButtons={5}
              />
            )}
          </div>
        </aside>

        <main className="er-content">
          {loading && filteredExams.length === 0 && (
            <EmptyStatePanel
              eyebrow="Loading"
              title="Loading exam results"
              message="We're gathering the latest mock board exam records and analytics."
            />
          )}

          {!loading && filteredExams.length > 0 && !selectedExamId && (
            <EmptyStatePanel
              eyebrow="Nothing Selected"
              title="Choose an exam to open its report"
              message="Select any exam from the left panel to view computed results, topic breakdowns, and threshold tracking."
            >
              <div className="er-empty-chip-row">
                <span className="er-empty-chip">Computed results</span>
                <span className="er-empty-chip">Topic breakdowns</span>
                <span className="er-empty-chip">Threshold tracking</span>
              </div>
            </EmptyStatePanel>
          )}

          {selectedExamId && loading && (
            <EmptyStatePanel
              eyebrow="Loading"
              title="Preparing exam analytics"
              message="Fetching the latest result snapshot for the exam you selected."
            />
          )}

          {selectedExamId && !loading && selectedExam?.targetAudience === 'alumni' && !activeReport && (
            <EmptyStatePanel
              eyebrow="No Attempts"
              title="No alumni attempts yet"
              message="Once alumni submit attempts for this exam, this page will show the average of each alumni's highest score."
            >
              <div className="er-empty-meta-grid">
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Exam</span>
                  <strong>{selectedExam?.name || 'Selected exam'}</strong>
                </div>
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Audience</span>
                  <strong>Alumni</strong>
                </div>
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Threshold</span>
                  <strong>{threshold}%</strong>
                </div>
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Creator</span>
                  <strong>{selectedExam?.createdBy?.name || '-'}</strong>
                </div>
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Created Date</span>
                  <strong>{formatDateTime(selectedExam?.createdAt) || '-'}</strong>
                </div>
              </div>
            </EmptyStatePanel>
          )}

          {selectedExamId && !loading && selectedExam?.targetAudience !== 'alumni' && !activeReport && (
            <EmptyStatePanel
              eyebrow="Analysis Pending"
              title="This exam does not have computed results yet"
              message="Generate the analytical breakdown to unlock topic performance, averages, and question-level insight."
              action={(
                <button
                  className="er-primary-btn"
                  onClick={() => handleCompute(selectedExamId)}
                  disabled={computingId === selectedExamId}
                >
                  {computingId === selectedExamId ? 'Starting analysis...' : 'Generate analysis'}
                </button>
              )}
            >
              <div className="er-empty-meta-grid">
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Exam</span>
                  <strong>{selectedExam?.name || 'Selected exam'}</strong>
                </div>
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Date</span>
                  <strong>{formatShortDate(selectedExam?.startDateTime)}</strong>
                </div>
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Threshold</span>
                  <strong>{threshold}%</strong>
                </div>
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Creator</span>
                  <strong>{selectedExam?.createdBy?.name || '-'}</strong>
                </div>
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Created Date</span>
                  <strong>{formatDateTime(selectedExam?.createdAt) || '-'}</strong>
                </div>
              </div>
            </EmptyStatePanel>
          )}

          {activeReport && summary && (
            <>
              <div style={{ display: 'flex' }}>
                <ReportTabToggle
                  activeTab={activeTab}
                  onChange={setActiveTab}
                  showIndividual
                />
              </div>
              <div className="er-report-view">
                <div className="er-report-header">
                  <div className="er-report-title-row">
                    <div className="er-report-title-group">
                      <span className="er-report-kicker">
                        {activeReport.targetAudience === 'alumni' ? 'Alumni Highest Score Report' : 'Computed Report'}
                      </span>
                      <h2 className="er-report-title">{activeReport.examName}</h2>
                    </div>

                    {activeReport.targetAudience === 'alumni' && (
                      <button
                        type="button"
                        className="er-download-btn"
                        onClick={handleExportExcel}
                        disabled={exportingExcel}
                        title="Download the alumni results of this exam as an Excel file (.xlsx)"
                      >
                        <svg className="er-download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                          <path d="M14 3v5h5" />
                          <rect x="8" y="11" width="8" height="7" rx="0.6" />
                          <path d="M8 14.5h8M12 11v7" />
                        </svg>
                        <span className="er-download-text">
                          <span className="er-download-label">{exportingExcel ? 'Preparing file...' : 'Download Excel'}</span>
                          <span className="er-download-hint">Alumni results (.xlsx)</span>
                        </span>
                        <span className="er-download-arrow" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 4v11" />
                            <path d="m7 10 5 5 5-5" />
                            <path d="M5 20h14" />
                          </svg>
                        </span>
                      </button>
                    )}
                  </div>

                  <dl className="er-report-facts">
                    <div className="er-report-fact">
                      <dt>Created by</dt>
                      <dd>{selectedExam?.createdBy?.name || '-'}</dd>
                    </div>
                    <div className="er-report-fact">
                      <dt>Created on</dt>
                      <dd>{formatDateTime(selectedExam?.createdAt) || '-'}</dd>
                    </div>
                    <div className="er-report-fact">
                      <dt>Last computed</dt>
                      <dd>{summary.computedAt || '-'}</dd>
                    </div>
                    <div className="er-report-fact">
                      <dt>{isAlumniReport ? 'Latest attempt' : 'Date conducted'}</dt>
                      <dd>{summary.date}</dd>
                    </div>
                    <div className="er-report-fact">
                      <dt>Passing threshold</dt>
                      <dd><span className="er-threshold-badge">{threshold}%</span></dd>
                    </div>
                  </dl>
                </div>

              {activeTab === 'overall' ? (
                <>
                  <section className="er-hero-card">
                    <div className="er-hero-topline">
                      <span className="er-hero-eyebrow">
                        {isAlumniReport ? "Based on each alumni's highest score" : 'Overall performance snapshot'}
                      </span>
                    </div>

                    <div className="er-hero-stats">
                      <div className="er-hero-stat">
                        <span className="er-hero-stat-label">Passed</span>
                        <strong className="er-hero-stat-value">{summary.passRate}%</strong>
                        <span className="er-hero-stat-sub">{summary.passedCount} of {plural(summary.takers, 'taker')}</span>
                      </div>
                      <div className="er-hero-stat">
                        <span className="er-hero-stat-label">Average score</span>
                        <strong className="er-hero-stat-value">{summary.overallAvg}%</strong>
                        <ThresholdGap average={summary.overallAvg} threshold={threshold} />
                      </div>
                      <div className="er-hero-stat">
                        <span className="er-hero-stat-label">Took the exam</span>
                        <strong className="er-hero-stat-value">
                          {summary.participation !== null ? `${summary.participation}%` : summary.takers}
                        </strong>
                        <span className="er-hero-stat-sub">
                          {summary.participation !== null
                            ? `${summary.takers} of ${summary.totalEligible} eligible ${audienceNoun}`
                            : `Eligible ${audienceNoun} count unavailable`}
                        </span>
                      </div>
                    </div>

                    <ScoreDistribution
                      ranges={summary.scoreDistribution}
                      threshold={threshold}
                      lowest={summary.lowestScore}
                      highest={summary.highestScore}
                    />

                    <ul className="er-hero-notes">
                      <HeroNote icon="nearMiss">
                        {summary.nearMissCount > 0 ? (
                          <>
                            <strong>{plural(summary.nearMissCount, 'taker')}</strong>
                            {summary.nearMissCount === 1 ? ' is' : ' are'} within {NEAR_MISS_POINTS} points of passing.
                          </>
                        ) : `No taker is within ${NEAR_MISS_POINTS} points of passing.`}
                      </HeroNote>
                      <HeroNote icon="topics">
                        {weakSubjects.length > 0 ? (
                          <>
                            Needs attention:{' '}
                            {weakSubjects.slice(0, 3).map((subject, idx) => (
                              <React.Fragment key={subject.name}>
                                {idx > 0 && ' · '}
                                <strong>{subject.name}</strong> {subject.averageScore}%
                              </React.Fragment>
                            ))}
                            {weakSubjects.length > 3 && ` · ${weakSubjects.length - 3} more below the threshold`}
                          </>
                        ) : 'Every topic is at or above the threshold.'}
                      </HeroNote>
                      {isAlumniReport && summary.retakes && (
                        <HeroNote icon="retakes">
                          {summary.retakes.retakers > 0 ? (
                            <>
                              <strong>{summary.retakes.improved} of {summary.retakes.retakers}</strong> alumni who retook it
                              raised their score ({plural(summary.totalAttempts, 'attempt')} in all).
                            </>
                          ) : `No retakes yet (${plural(summary.totalAttempts, 'attempt')} in all).`}
                        </HeroNote>
                      )}
                    </ul>
                  </section>

                  <section className="er-breakdown-card">
                    <div className="er-breakdown-header">
                      <h2>Score Breakdown by Topic</h2>
                      <p>Performance across each subject area in this exam. Expand a row to inspect question-level trends.</p>
                    </div>

                    <div className="er-topic-list">
                      {enrichedSubjects.map((subject, idx) => (
                        <TopicRow
                          key={idx}
                          subject={subject}
                          isExpanded={expandedSubjectName === subject.name}
                          onToggle={() => setExpandedSubjectName((prev) => (prev === subject.name ? null : subject.name))}
                        />
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <IndividualReportView
                  examId={selectedExamId}
                  threshold={threshold}
                  audience={activeReport.targetAudience === 'alumni' ? 'alumni' : 'student'}
                />
              )}
            </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default ExamResults;
