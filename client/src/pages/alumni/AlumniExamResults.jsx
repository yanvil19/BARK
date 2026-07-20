import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/shared/AvailableExams.css';
import '../../styles/shared/StudentExamResults.css';
import PageHeader from '../../components/PageHeader.jsx';
import SearchBar from '../../components/SearchBar.jsx';

const BASE = import.meta.env.VITE_API_URL;

function formatDate(date) {
  return new Date(date).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function getStatusMeta(status) {
  switch (status) {
    case 'passed':
      return { label: 'Passed', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' };
    case 'failed':
      return { label: 'Failed', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
    default:
      return null;
  }
}

function getStatusClass(avg, threshold) {
  if (avg >= threshold) return 'green';
  if (avg >= threshold * 0.7) return 'orange';
  return 'red';
}

function getAttemptPercentage(attempt) {
  if (!attempt || attempt.totalScore <= 0) return 0;
  return Math.round((attempt.rawScore / attempt.totalScore) * 100);
}

function SkeletonCard() {
  return (
    <div className="ae-card ae-card--skeleton">
      <div className="ae-skel-title ae-pulse" />
      <div className="ae-skel-subtitle ae-pulse" />
      <div className="ae-skel-row">
        <div className="ae-skel-pill ae-pulse" />
        <div className="ae-skel-pill ae-pulse" />
        <div className="ae-skel-pill ae-pulse" />
      </div>
      <div className="ae-skel-btn ae-pulse" />
    </div>
  );
}

function CircularProgress({ percentage, threshold }) {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="ser-circular-container">
      <svg className="ser-circular-svg" viewBox="0 0 180 180" aria-hidden="true">
        <circle className="ser-circular-bg" cx="90" cy="90" r={radius} />
        <circle
          className="ser-circular-fill"
          cx="90"
          cy="90"
          r={radius}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <div className="ser-circular-text">
        <span className="big-pct">{percentage}%</span>
        <span className="small-total">/ 100%</span>
        <div className="ser-threshold-label">Threshold: {threshold}%</div>
      </div>
    </div>
  );
}

export default function AlumniExamResults({ examId }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [selectedExam, setSelectedExam] = useState(null);
  const [showAttempts, setShowAttempts] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [attemptDetails, setAttemptDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    async function fetchAttempts() {
      console.log("FETCHING ATTEMPTS");
      setLoading(true);
      try {
        let allAttempts = [];

        if (examId) {
          const data = await apiAuth(`${BASE}/api/alumni-exams/${encodeURIComponent(examId)}/my-attempts`);
          allAttempts = data.attempts || [];
        } else {
          const available = await apiAuth(`${BASE}/api/alumni-exams/available`);
          const exams = available.exams || [];
          const attemptsByExam = await Promise.all(
            exams.map((exam) =>
              apiAuth(`${BASE}/api/alumni-exams/${encodeURIComponent(exam._id)}/my-attempts`)
                .then((data) => data.attempts || [])
                .catch(() => [])
            )
          );
          allAttempts = attemptsByExam.flat();
          console.log(
            "ALL ATTEMPTS COUNT:",
            allAttempts.length
          );

          console.log(
            allAttempts.map(a => ({
              examId: a.examId,
              examName: a.examName,
              attemptNumber: a.attemptNumber
            }))
          );
        }

        const sorted = allAttempts.sort((a, b) => {
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

  const filteredAttempts = useMemo(() => {
    const q = search.trim().toLowerCase();

    return attempts.filter((attempt) =>
      String(attempt?.examName || '')
        .toLowerCase()
        .includes(q)
    );
  }, [attempts, search]);

  const loadAttemptDetails = async (attempt) => {
    console.log("SELECTED ATTEMPT", attempt);
    console.log(
      "DETAIL URL",
      `${BASE}/api/alumni-exams/attempt/${attempt._id || attempt.id}`
    );
    try {
      setLoadingDetails(true);

      const data = await apiAuth(
        `${BASE}/api/alumni-exams/attempt/${attempt._id || attempt.id}`
      );

      setAttemptDetails(data);
    } catch (err) {
      console.error('Failed to load attempt details:', err);
      setAttemptDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const groupedResults = useMemo(() => {
    const groups = {};

    filteredAttempts.forEach((attempt) => {

      console.log(
        "GROUP:",
        attempt.examId,
        attempt.examName
      );

      const key = attempt.examId;

      if (!groups[key]) {
        groups[key] = {
          examId: attempt.examId,
          examName: attempt.examName,
          attempts: [],
        };
      }

      groups[key].attempts.push(attempt);
    });

    const result = Object.values(groups);

    console.log(
      "GROUPED RESULTS:",
      result.map(g => ({
        examId: g.examId,
        examName: g.examName,
        attempts: g.attempts.length
      }))
    );

    return result;
  }, [filteredAttempts]);

  useEffect(() => {
    if (
      groupedResults.length > 0 &&
      !selectedExam
    ) {
      setSelectedExam(groupedResults[0]);
      setSelectedAttempt(groupedResults[0].attempts[0]);
    }
  }, [groupedResults]);

  useEffect(() => {
    if (selectedAttempt) {
      loadAttemptDetails(selectedAttempt);
    }
  }, [selectedAttempt]);

  console.log("ATTEMPT DETAILS", attemptDetails);

  const hasResults = filteredAttempts.length > 0;
  const selectedPercentage = getAttemptPercentage(selectedAttempt);
  const selectedThreshold = selectedAttempt?.passingThreshold || 70;

  return (
    <main className="sae-page-container">
      <PageHeader
        className="shared-page-header--bleed-lr"
        title="Exam Results"
        subtitle="View your alumni exam attempts and performance breakdown"
      />

      <div className="ca-filters ae-filters">
        <SearchBar
          value={search}
          onChange={setSearch}
          className="ca-search"
          placeholder="Search exam results..."
          ariaLabel="Search exam results"
        />
      </div>

      <div className="ser-page-content-wrapper">
        <>
          {loading && (
            <section className="ae-grid" aria-label="Loading attempts">
              {[0, 1, 2].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </section>
          )}

          {!loading && attempts.length === 0 && (
            <div className="ae-empty" role="status">
              No alumni exam attempts available yet.
            </div>
          )}

          {!loading && attempts.length > 0 && !hasResults && (
            <div className="ae-empty" role="status">
              No results found matching your search.
            </div>
          )}

          {!loading && hasResults && (
            <div className="ser-layout">

              {/* LEFT SIDEBAR */}
              <aside className="ser-sidebar">

                <div className="ser-sidebar-header">
                  <h3>Exams</h3>
                  <span>{groupedResults.length}</span>
                </div>

                <div className="ser-exam-list">
                  {groupedResults.map((exam) => {

                    console.log(
                      "RENDERING EXAM:",
                      exam.examName,
                      exam.examId
                    );

                    const latestAttempt = exam.attempts[0];

                    const bestAttempt = exam.attempts.reduce(
                      (best, current) => {
                        const currentPct =
                          (current.rawScore / current.totalScore) * 100;

                        const bestPct =
                          (best.rawScore / best.totalScore) * 100;

                        return currentPct > bestPct
                          ? current
                          : best;
                      },
                      exam.attempts[0]
                    );

                    return (
                      <div
                        key={exam.examId}
                        className={`ser-exam-card ${selectedExam?.examId === exam.examId
                          ? 'ser-exam-card--active'
                          : ''
                          }`}
                        onClick={() => {
                          setSelectedExam(exam);
                          setSelectedAttempt(exam.attempts[0]);
                        }}
                      >
                        <h4>{exam.examName}</h4>

                        <div className="ser-exam-meta">
                          <span>{exam.attempts.length} Attempts</span>
                        </div>

                        <div className="ser-exam-stats">
                          <div>
                            Best:
                            {' '}
                            {Math.round(
                              (bestAttempt.rawScore /
                                bestAttempt.totalScore) *
                              100
                            )}
                            %
                          </div>

                          <div>
                            Latest:
                            {' '}
                            #{latestAttempt.attemptNumber}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </aside>

              {/* RIGHT PANEL */}
              <section className="ser-detail-panel">

                {!selectedExam && (
                  <div className="ae-empty">
                    Select an exam to view details.
                  </div>
                )}

                {selectedExam && (
                  <>
                    {/* EXAM HEADER */}
                    <div className="ser-report-header">
                      <div className="ser-report-title-wrap">
                        <h2>{selectedExam.examName}</h2>
                      </div>

                      <div className="ser-report-meta">
                        <span>
                          {selectedExam.attempts.length} Attempts
                        </span>
                      </div>
                    </div>

                    <div className="ser-exam-overview">

                      <div className="ser-summary-card">
                        <span>Attempts</span>
                        <strong>{selectedExam.attempts.length}</strong>
                      </div>

                      <div className="ser-summary-card">
                        <span>Latest Attempt</span>
                        <strong>
                          #{selectedExam.attempts[0]?.attemptNumber}
                        </strong>
                      </div>

                      <div className="ser-summary-card">
                        <span>Best Score</span>
                        <strong>
                          {Math.max(
                            ...selectedExam.attempts.map(a =>
                              getAttemptPercentage(a)
                            )
                          )}%
                        </strong>
                      </div>

                    </div>

                    {/* ATTEMPT HISTORY */}
                    <section className="ser-attempt-history-card">

                      <div className="ser-attempt-history-header">
                        <h3>Attempt History</h3>

                        <button
                          className="ser-toggle-attempts-btn"
                          onClick={() => setShowAttempts(!showAttempts)}
                        >
                          {showAttempts ? 'Hide' : 'Show Attempts'}
                        </button>
                      </div>

                      {showAttempts && (
                        <div className="ae-attempt-history">
                          {selectedExam.attempts.map((attempt) => {

                            const percentage =
                              getAttemptPercentage(attempt);

                            const threshold =
                              attempt.passingThreshold;

                            const statusClass =
                              percentage >= threshold
                                ? 'status-green'
                                : 'status-red';

                            return (
                              <div
                                key={attempt._id || attempt.id}
                                className={`ae-attempt-row ${selectedAttempt?.attemptNumber === attempt.attemptNumber
                                  ? 'ae-attempt-row--active'
                                  : ''
                                  }`}
                                onClick={() =>
                                  setSelectedAttempt(attempt)
                                }
                              >
                                <div>
                                  Attempt #{attempt.attemptNumber}
                                </div>

                                <div
                                  className={`ae-attempt-center ${statusClass}`}
                                >
                                  {percentage}%
                                </div>

                                <div>
                                  {formatDate(
                                    attempt.submittedAt ||
                                    attempt.date
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    {/* ATTEMPT DETAILS */}
                    {selectedAttempt && (
                      <>
                        <section className="ser-hero-card">
                          <CircularProgress
                            percentage={selectedPercentage}
                            threshold={selectedThreshold}
                          />

                          <div className="ser-hero-metrics">

                            <div className="ser-metric-item">
                              <span className="m-value">
                                {selectedPercentage}%
                              </span>
                              <span className="m-label">
                                Average Score
                              </span>
                            </div>

                            <div className="ser-metric-item">
                              <span className="m-value">
                                {selectedAttempt.rawScore} /
                                {selectedAttempt.totalScore}
                              </span>

                              <span className="m-label">
                                Raw Score
                              </span>
                            </div>

                            <div className="ser-metric-item">
                              <span className="m-value">
                                Attempt #
                                {selectedAttempt.attemptNumber}
                              </span>

                              <span className="m-label">
                                Attempt Number
                              </span>
                            </div>

                          </div>
                        </section>

                        {selectedAttempt.subjectScores?.length > 0 && (
                          <section className="ser-breakdown-card">

                            <div className="ser-breakdown-header">
                              <h2>
                                Score Breakdown by Topic
                              </h2>

                              <p>
                                Performance across each
                                subject area
                              </p>
                            </div>

                            <div className="ser-topic-list">
                              {selectedAttempt.subjectScores.map(
                                (subject, idx) => {

                                  const pct =
                                    subject.total > 0
                                      ? Math.round(
                                        (subject.correct /
                                          subject.total) * 100
                                      )
                                      : 0;

                                  const status =
                                    getStatusClass(
                                      pct,
                                      selectedThreshold
                                    );

                                  return (
                                    <div key={idx}>

                                      <div
                                        className={`ser-topic-row ${selectedSubject === subject.name
                                          ? 'ser-topic-row--active'
                                          : ''
                                          }`}
                                        onClick={() =>
                                          setSelectedSubject(
                                            selectedSubject === subject.name
                                              ? null
                                              : subject.name
                                          )
                                        }
                                      >

                                        <div className="ser-topic-main">
                                          <div
                                            className={`ser-topic-name status-${status}`}
                                          >
                                            {subject.name}
                                          </div>

                                          <div className="ser-topic-score-group">
                                            <div
                                              className={`ser-topic-pct status-${status}`}
                                            >
                                              {pct}%
                                            </div>

                                            <div className="ser-topic-fraction">
                                              {subject.correct}/
                                              {subject.total}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="ser-topic-bar-bg">
                                          <div
                                            className={`ser-topic-bar-fill bg-${status}`}
                                            style={{
                                              width: `${pct}%`
                                            }}
                                          />
                                        </div>

                                      </div>
                                      {selectedSubject === subject.name &&
                                        attemptDetails?.questions && (
                                          <div className="ser-subject-questions">

                                            {attemptDetails.questions
                                              .filter(
                                                q => q.subjectName === subject.name
                                              )
                                              .map((q, qIndex) => (

                                                <div
                                                  key={q._id}
                                                  className="ser-question-card"
                                                >
                                                  <h4>
                                                    {qIndex + 1}. {q.title}
                                                  </h4>

                                                  {q.description && (
                                                    <p>{q.description}</p>
                                                  )}

                                                  <div className="ser-answer-list">
                                                    {q.answers.map((answer) => {

                                                      const isCorrect =
                                                        String(answer._id) ===
                                                        String(q.correctAnswer);

                                                      const isUser =
                                                        String(answer._id) ===
                                                        String(q.userAnswer);

                                                      return (
                                                        <div
                                                          key={answer._id}
                                                          className={`ser-answer-option
                          ${isCorrect ? 'answer-correct' : ''}
                          ${isUser && !isCorrect
                                                              ? 'answer-wrong'
                                                              : ''
                                                            }
                        `}
                                                        >
                                                          {answer.text}
                                                        </div>
                                                      );
                                                    })}
                                                  </div>

                                                </div>

                                              ))}
                                          </div>
                                        )}

                                    </div>
                                  );
                                }
                              )}
                            </div>

                          </section>
                        )}


                      </>
                    )}
                  </>
                )}

              </section>

            </div>
          )}
        </>
      </div>

    </main >
  );
}