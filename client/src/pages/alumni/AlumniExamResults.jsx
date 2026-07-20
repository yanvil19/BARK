import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/alumni/AlumniExamResults.css';
import PageHeader from '../../components/PageHeader.jsx';
import SearchBar from '../../components/SearchBar.jsx';

const BASE = import.meta.env.VITE_API_URL;

function formatDate(date) {
  if (!date) return 'No date';
  return new Date(date).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatShortDate(date) {
  if (!date) return 'No date';
  return new Date(date).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getPercentage(attempt) {
  if (!attempt || !attempt.totalScore) return 0;
  return Math.round((Number(attempt.rawScore || 0) / Number(attempt.totalScore || 1)) * 100);
}

function getStatusClass(score, threshold) {
  if (score >= threshold) return 'green';
  if (score >= threshold * 0.7) return 'orange';
  return 'red';
}

function getAttemptId(attempt) {
  return attempt?._id || attempt?.id || '';
}

function EmptyStatePanel({ eyebrow, title, message, children }) {
  return (
    <section className="aer-empty-state-card">
      {eyebrow && <span className="aer-empty-eyebrow">{eyebrow}</span>}
      <h2 className="aer-empty-title">{title}</h2>
      <p className="aer-empty-message">{message}</p>
      {children}
    </section>
  );
}

function CircularProgress({ percentage, threshold }) {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="aer-circular-container">
      <svg className="aer-circular-svg" viewBox="0 0 180 180" aria-hidden="true">
        <circle className="aer-circular-bg" cx="90" cy="90" r={radius} />
        <circle
          className="aer-circular-fill"
          cx="90"
          cy="90"
          r={radius}
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
        />
      </svg>
      <div className="aer-circular-text">
        <span className="big-pct">{percentage}%</span>
        <span className="small-total">/ 100%</span>
        <div className="aer-threshold-label">Threshold: {threshold}%</div>
      </div>
    </div>
  );
}

function SidebarExamItem({ exam, isActive, onSelect }) {
  return (
    <button type="button" className={`aer-sidebar-item ${isActive ? 'active' : ''}`} onClick={() => onSelect(exam.examId)}>
      <div className="aer-sidebar-item-top">
        <div>
          <div className="aer-side-name">{exam.examName}</div>
          <div className="aer-side-meta">{formatShortDate(exam.latestDate)}</div>
        </div>
        <span className="aer-status-pill">{exam.attempts.length} attempts</span>
      </div>
      <div className="aer-sidebar-item-bottom">
        <span>Best {exam.bestPercentage}%</span>
        <span>Latest #{exam.latestAttempt?.displayAttemptNumber || exam.latestAttempt?.attemptNumber || '-'}</span>
      </div>
    </button>
  );
}

function AttemptRow({ attempt, isActive, onSelect }) {
  const percentage = getPercentage(attempt);
  const threshold = attempt.passingThreshold || 70;
  const status = getStatusClass(percentage, threshold);

  return (
    <button type="button" className={`aer-attempt-row ${isActive ? 'active' : ''}`} onClick={() => onSelect(attempt)}>
      <div>
        <strong>Attempt #{attempt.displayAttemptNumber || attempt.attemptNumber || '-'}</strong>
        <span>{formatDate(attempt.submittedAt || attempt.date)}</span>
      </div>
      <div className="aer-attempt-score">
        <span className={`aer-score-text status-${status}`}>{percentage}%</span>
        <span>{attempt.rawScore}/{attempt.totalScore}</span>
      </div>
      <span className={`aer-result-chip status-${status}`}>{percentage >= threshold ? 'Passed' : 'Failed'}</span>
    </button>
  );
}

function TopicBreakdown({ subjects, threshold }) {
  if (!subjects?.length) return null;

  return (
    <section className="aer-breakdown-card">
      <div className="aer-breakdown-header">
        <h2>Score Breakdown by Topic</h2>
        <p>Performance across each subject area in this attempt.</p>
      </div>
      <div className="aer-topic-list">
        {subjects.map((subject, index) => {
          const percentage = subject.total > 0 ? Math.round((subject.correct / subject.total) * 100) : 0;
          const status = getStatusClass(percentage, threshold);
          return (
            <div key={`${subject.name}-${index}`} className="aer-topic-row">
              <div className="aer-topic-main">
                <div className={`aer-topic-name status-${status}`}>{subject.name}</div>
                <span>{subject.correct}/{subject.total} correct</span>
              </div>
              <div className="aer-topic-bar-bg">
                <div className={`aer-topic-bar-fill bg-${status}`} style={{ width: `${percentage}%` }} />
              </div>
              <div className={`aer-topic-pct status-${status}`}>{percentage}%</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QuestionReview({ questions }) {
  const [mode, setMode] = useState('all');
  const [expandedQuestions, setExpandedQuestions] = useState(() => new Set());
  const filtered = useMemo(() => {
    if (mode === 'correct') {
      return questions.filter((question) => String(question.userAnswer || '') === String(question.correctAnswer || ''));
    }
    if (mode === 'wrong') {
      return questions.filter((question) => String(question.userAnswer || '') !== String(question.correctAnswer || ''));
    }
    return questions;
  }, [mode, questions]);

  useEffect(() => {
    setExpandedQuestions(new Set());
  }, [mode, questions]);

  if (!questions?.length) return null;

  const toggleQuestion = (questionKey) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(questionKey)) next.delete(questionKey);
      else next.add(questionKey);
      return next;
    });
  };

  return (
    <section className="aer-breakdown-card">
      <div className="aer-breakdown-header aer-question-review-header">
        <div>
          <h2>Question and Answer Review</h2>
          <p>Review the full question, your selected answer, and the correct answer.</p>
        </div>
        <div className="aer-toggle-group">
          <button type="button" className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>
            All
          </button>
          <button type="button" className={mode === 'correct' ? 'active' : ''} onClick={() => setMode('correct')}>
            Correct only
          </button>
          <button type="button" className={mode === 'wrong' ? 'active' : ''} onClick={() => setMode('wrong')}>
            Wrong only
          </button>
        </div>
      </div>

      <div className="aer-question-list">
        {filtered.length > 0 ? filtered.map((question, index) => {
          const questionKey = question._id || String(index);
          const selectedId = String(question.userAnswer || '');
          const correctId = String(question.correctAnswer || '');
          const isCorrect = selectedId && selectedId === correctId;
          const isExpanded = expandedQuestions.has(questionKey);

          return (
            <article key={questionKey} className={`aer-question-card ${isCorrect ? 'correct' : 'wrong'}`}>
              <button type="button" className="aer-question-dropdown" onClick={() => toggleQuestion(questionKey)}>
                <span className="aer-question-number">Question {index + 1}</span>
                <span className="aer-question-dropdown-title">{question.title || question.description || 'Untitled question'}</span>
                <span className={`aer-result-chip status-${isCorrect ? 'green' : 'red'}`}>{isCorrect ? 'Correct' : 'Wrong'}</span>
                <span className={`aer-chevron ${isExpanded ? 'expanded' : ''}`} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>

              {isExpanded && (
                <div className="aer-question-dropdown-body">
                  <h3>{question.title || 'Untitled question'}</h3>
                  {question.description && <p className="aer-question-description">{question.description}</p>}

                  {Array.isArray(question.images) && question.images.length > 0 && (
                    <div className="aer-question-images">
                      {question.images.map((image, imageIndex) => (
                        <img key={`${questionKey}-${imageIndex}`} src={image.url || image} alt={`Question ${index + 1}`} />
                      ))}
                    </div>
                  )}

                  <div className="aer-answer-list">
                    {(question.answers || []).map((answer) => {
                      const answerId = String(answer._id || '');
                      const selected = selectedId === answerId;
                      const correct = correctId === answerId || answer.isCorrect;
                      return (
                        <div key={answerId || answer.text} className={`aer-answer-row ${correct ? 'correct' : ''} ${selected ? 'selected' : ''}`}>
                          <span>{answer.text || 'Untitled answer'}</span>
                          <div className="aer-answer-tags">
                            {selected && <em>Your answer</em>}
                            {correct && <strong>Correct answer</strong>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          );
        }) : (
          <div className="aer-question-empty">No questions match this filter.</div>
        )}
      </div>
    </section>
  );
}

export default function AlumniExamResults({ examId }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedExamId, setSelectedExamId] = useState(examId || '');
  const [selectedAttemptId, setSelectedAttemptId] = useState('');
  const [attemptDetails, setAttemptDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    async function fetchAttempts() {
      setLoading(true);
      try {
        const data = examId
          ? await apiAuth(`${BASE}/api/alumni-exams/${encodeURIComponent(examId)}/my-attempts`)
          : await apiAuth(`${BASE}/api/alumni-exams/my-attempts`);

        const sorted = (data.attempts || [])
          .filter((attempt) => attempt.examId && attempt.examName && attempt.examName !== 'Unknown Exam')
          .sort((a, b) => {
          const dateDiff = new Date(b.submittedAt || b.date) - new Date(a.submittedAt || a.date);
          if (dateDiff !== 0) return dateDiff;
          return (b.attemptNumber || 0) - (a.attemptNumber || 0);
        });
        setAttempts(sorted);
      } catch (err) {
        console.error('Failed to load alumni attempts:', err);
        setAttempts([]);
      } finally {
        setLoading(false);
      }
    }

    fetchAttempts();
  }, [examId]);

  const exams = useMemo(() => {
    const grouped = new Map();
    attempts.forEach((attempt) => {
      const key = String(attempt.examId || 'unknown');
      if (!grouped.has(key)) {
        grouped.set(key, {
          examId: key,
          examName: attempt.examName,
          attempts: [],
          latestDate: attempt.submittedAt || attempt.date,
        });
      }
      grouped.get(key).attempts.push(attempt);
    });

    return Array.from(grouped.values()).map((exam) => {
      const chronologicalAttempts = [...exam.attempts].sort(
        (a, b) => new Date(a.submittedAt || a.date) - new Date(b.submittedAt || b.date)
      );
      const attemptNumberById = new Map(
        chronologicalAttempts.map((attempt, index) => [getAttemptId(attempt), index + 1])
      );
      const numberedAttempts = exam.attempts.map((attempt) => ({
        ...attempt,
        displayAttemptNumber: attempt.attemptNumber || attemptNumberById.get(getAttemptId(attempt)),
      }));
      const bestAttempt = numberedAttempts.reduce((best, current) => (
        getPercentage(current) > getPercentage(best) ? current : best
      ), numberedAttempts[0]);
      return {
        ...exam,
        attempts: numberedAttempts,
        latestAttempt: numberedAttempts[0],
        bestAttempt,
        bestPercentage: getPercentage(bestAttempt),
      };
    });
  }, [attempts]);

  const filteredExams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exams.filter((exam) => exam.examName.toLowerCase().includes(q));
  }, [exams, search]);

  useEffect(() => {
    if (examId) {
      setSelectedExamId(String(examId));
      return;
    }
    if (!selectedExamId && filteredExams.length > 0) {
      setSelectedExamId(filteredExams[0].examId);
    }
  }, [examId, filteredExams, selectedExamId]);

  const selectedExam = filteredExams.find((exam) => String(exam.examId) === String(selectedExamId)) || null;
  const selectedAttempt = selectedExam?.attempts.find((attempt) => getAttemptId(attempt) === selectedAttemptId) || selectedExam?.attempts[0] || null;
  const latestAttempt = selectedExam?.latestAttempt || selectedAttempt;
  const selectedPercentage = getPercentage(selectedAttempt);
  const selectedThreshold = selectedAttempt?.passingThreshold || 70;
  const selectedStatus = getStatusClass(selectedPercentage, selectedThreshold);

  useEffect(() => {
    const attemptId = getAttemptId(selectedAttempt);
    if (!attemptId) {
      setSelectedAttemptId('');
      setAttemptDetails(null);
      return;
    }

    setSelectedAttemptId(attemptId);
    let mounted = true;
    async function fetchAttemptDetails() {
      setDetailsLoading(true);
      try {
        const data = await apiAuth(`${BASE}/api/alumni-exams/attempt/${encodeURIComponent(attemptId)}`);
        if (!mounted) return;
        setAttemptDetails(data);
      } catch (err) {
        console.error('Failed to load alumni attempt details:', err);
        if (mounted) setAttemptDetails(null);
      } finally {
        if (mounted) setDetailsLoading(false);
      }
    }

    fetchAttemptDetails();
    return () => {
      mounted = false;
    };
  }, [selectedAttempt]);

  return (
    <div className="aer-page">
      <PageHeader
        className="shared-page-header--bleed-lr"
        title="Alumni Exam Results"
        subtitle="Review your attempts, scores, answers, and full question feedback."
      />

      <div className="aer-layout">
        <aside className="aer-sidebar">
          <div className="aer-sidebar-card">
            <div className="aer-sidebar-header">
              <div>
                <h3>Exams</h3>
                <p>Choose an alumni exam to inspect your attempts.</p>
              </div>
              <div className="aer-sidebar-count">{exams.length}</div>
            </div>

            <div className="aer-sidebar-summary">
              <div className="aer-sidebar-summary-card">
                <span>Total attempts</span>
                <strong>{attempts.length}</strong>
              </div>
              <div className="aer-sidebar-summary-card">
                <span>Best score</span>
                <strong>{exams.length ? Math.max(...exams.map((exam) => exam.bestPercentage)) : 0}%</strong>
              </div>
            </div>

            <SearchBar
              value={search}
              onChange={setSearch}
              className="aer-search"
              placeholder="Search exam results..."
              ariaLabel="Search alumni exam results"
            />

            <div className="aer-sidebar-scroll">
              {!loading && filteredExams.length === 0 && (
                <EmptyStatePanel
                  eyebrow="No Results"
                  title="No alumni attempts yet"
                  message="Completed alumni exam attempts will appear here."
                />
              )}

              {filteredExams.map((exam) => (
                <SidebarExamItem
                  key={exam.examId}
                  exam={exam}
                  isActive={String(selectedExamId) === String(exam.examId)}
                  onSelect={(id) => {
                    setSelectedExamId(id);
                    setSelectedAttemptId('');
                  }}
                />
              ))}
            </div>
          </div>
        </aside>

        <main className="aer-content">
          {loading && (
            <EmptyStatePanel
              eyebrow="Loading"
              title="Loading alumni results"
              message="We're gathering your completed attempts and score breakdowns."
            />
          )}

          {!loading && selectedExam && selectedAttempt && (
            <div className="aer-report-view">
              <div className="aer-report-header">
                <div>
                  <span className="aer-report-kicker">Alumni Attempt Report</span>
                  <h2 className="aer-report-title">{selectedExam.examName}</h2>
                </div>
                <div className="aer-report-meta">
                  <span>Attempt #{selectedAttempt.displayAttemptNumber || selectedAttempt.attemptNumber || '-'}</span>
                  <span className="aer-divider">|</span>
                  <span>{formatDate(selectedAttempt.submittedAt || selectedAttempt.date)}</span>
                  <span className={`aer-result-chip status-${selectedStatus}`}>
                    {selectedPercentage >= selectedThreshold ? 'Passed' : 'Failed'}
                  </span>
                </div>
              </div>

              <section className="aer-hero-card">
                <div className="aer-hero-topline">
                  <span>Selected attempt performance</span>
                  <div className="aer-hero-threshold-pill">Threshold {selectedThreshold}%</div>
                </div>

                <div className="aer-hero-body">
                  <CircularProgress percentage={selectedPercentage} threshold={selectedThreshold} />
                </div>

                <div className="aer-hero-metrics">
                  <div className="aer-metric-item">
                    <span className="m-value">{latestAttempt?.rawScore ?? 0}/{latestAttempt?.totalScore ?? 0}</span>
                    <span className="m-label">Latest raw score</span>
                  </div>
                  <div className="aer-metric-item">
                    <span className="m-value">
                      {selectedExam.bestAttempt?.rawScore ?? 0}/{selectedExam.bestAttempt?.totalScore ?? 0}
                    </span>
                    <span className="m-label">Highest score</span>
                  </div>
                  <div className="aer-metric-item">
                    <span className="m-value">{formatShortDate(selectedAttempt.submittedAt || selectedAttempt.date)}</span>
                    <span className="m-label">Date answered</span>
                  </div>
                </div>
              </section>

              <section className="aer-breakdown-card">
                <div className="aer-breakdown-header">
                  <h2>Attempt History</h2>
                  <p>Select an attempt to view its exact score, answers, and question review.</p>
                </div>
                <div className="aer-attempt-list">
                  {selectedExam.attempts.map((attempt) => (
                    <AttemptRow
                      key={getAttemptId(attempt)}
                      attempt={attempt}
                      isActive={getAttemptId(attempt) === getAttemptId(selectedAttempt)}
                      onSelect={(nextAttempt) => setSelectedAttemptId(getAttemptId(nextAttempt))}
                    />
                  ))}
                </div>
              </section>

              {detailsLoading ? (
                <EmptyStatePanel
                  eyebrow="Loading"
                  title="Loading answer review"
                  message="Preparing the full question and answer breakdown for this attempt."
                />
              ) : (
                <>
                  <TopicBreakdown subjects={attemptDetails?.attempt?.subjectScores || selectedAttempt.subjectScores} threshold={selectedThreshold} />
                  <QuestionReview questions={attemptDetails?.questions || []} />
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
