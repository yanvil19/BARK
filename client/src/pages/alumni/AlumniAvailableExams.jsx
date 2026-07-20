import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/alumni/AlumniAvailableExams.css';
import PageHeader from '../../components/PageHeader.jsx';
import SearchBar from '../../components/SearchBar.jsx';

const BASE = import.meta.env.VITE_API_URL;

function IconClock(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v6l4 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconList(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M8 6h13M8 12h13M8 18h13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M7 3v3M17 3v3M4 8h16M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatStartDateTime(value) {
  return value
    ? new Date(value).toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : 'TBA';
}

function getExamStatus(exam) {
  return exam.status === 'ongoing' ? 'ongoing' : 'published';
}

function getStatusLabel(status) {
  return status === 'ongoing' ? 'On-going' : 'Published';
}

function formatDuration(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return 'Untimed';
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

function SkeletonCard({ keyId }) {
  return (
    <div key={keyId} className="aae-card aae-card--skeleton" aria-hidden="true">
      <div className="aae-skel-title aae-pulse" />
      <div className="aae-skel-subtitle aae-pulse" />
      <div className="aae-skel-row">
        <div className="aae-skel-pill aae-pulse" />
        <div className="aae-skel-pill aae-pulse" />
        <div className="aae-skel-pill aae-pulse" />
      </div>
      <div className="aae-skel-btn aae-pulse" />
    </div>
  );
}

export default function AlumniAvailableExams({ onTakeExam }) {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    let mounted = true;
    async function fetchExams() {
      setLoading(true);
      try {
        const data = await apiAuth(`${BASE}/api/alumni-exams/available`);
        if (!mounted) return;
        setExams(Array.isArray(data.exams) ? data.exams : []);
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to load alumni exams:', err);
        setExams([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchExams();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredExams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exams.filter((exam) => {
      const matchesSearch = String(exam?.name || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || getExamStatus(exam) === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [exams, search, statusFilter]);

  const statusCounts = useMemo(() => ({
    all: exams.length,
    published: exams.filter((exam) => getExamStatus(exam) === 'published').length,
    ongoing: exams.filter((exam) => getExamStatus(exam) === 'ongoing').length,
  }), [exams]);

  const hasAnyExams = exams.length > 0;
  const hasResults = filteredExams.length > 0;

  return (
    <main className="aae-page">
      <PageHeader
        className="shared-page-header--bleed-lr"
        title="Available Exams"
        subtitle="Browse alumni mock board exams for your program. Published exams are visible, while only on-going exams can be answered."
      />

      <section className="aae-toolbar">
        <div className="aae-status-tabs" role="tablist" aria-label="Exam status filters">
          {[
            ['all', 'All'],
            ['published', 'Published'],
            ['ongoing', 'On-going'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`aae-status-tab ${statusFilter === key ? 'active' : ''}`}
              onClick={() => setStatusFilter(key)}
            >
              <span>{label}</span>
              <strong>{statusCounts[key]}</strong>
            </button>
          ))}
        </div>
        <SearchBar
          value={search}
          onChange={setSearch}
          className="aae-search"
          placeholder="Search exams..."
          ariaLabel="Search exams"
        />
      </section>

      {loading && (
        <section className="aae-grid" aria-label="Loading exams">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} keyId={`skel-${i}`} />
          ))}
        </section>
      )}

      {!loading && !hasAnyExams && (
        <div className="aae-empty" role="status">
          No alumni exams are currently available.
        </div>
      )}

      {!loading && hasAnyExams && !hasResults && (
        <div className="aae-empty" role="status">
          No exams found matching your search.
        </div>
      )}

      {!loading && hasResults && (
        <section className="aae-grid" aria-label="Available alumni exams">
          {filteredExams.map((exam) => {
            const status = getExamStatus(exam);
            const canTakeExam = status === 'ongoing';
            return (
            <article key={exam._id} className={`aae-card aae-card--${status}`}>
              <div className="aae-card-body">
                <div className="aae-card-heading">
                  <div>
                    <h3 className="aae-title">{exam.name}</h3>
                    <div className="aae-subtitle">{exam.program?.name || '-'}</div>
                  </div>
                  <span className={`aae-status-badge status-${status}`}>{getStatusLabel(status)}</span>
                </div>

                <div className="aae-pills">
                  <div className="aae-pill" title="Duration">
                    <IconClock className="aae-pill-icon" />
                    <span>{exam.isTimed ? formatDuration(exam.timeLimitMinutes) : 'Untimed'}</span>
                  </div>
                  <div className="aae-pill" title="Number of items">
                    <IconList className="aae-pill-icon" />
                    <span>{`${exam.questionCount ?? 0} items`}</span>
                  </div>
                  <div className="aae-pill" title="Exam start date">
                    <IconCalendar className="aae-pill-icon" />
                    <span>{formatStartDateTime(exam.startDateTime)}</span>
                  </div>
                  {exam.endDateTime && (
                    <div className="aae-pill" title="Exam end date">
                      <IconCalendar className="aae-pill-icon" />
                      <span>Until {formatStartDateTime(exam.endDateTime)}</span>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="aae-btn"
                disabled={!canTakeExam}
                aria-disabled={!canTakeExam}
                onClick={() => {
                  if (canTakeExam && typeof onTakeExam === 'function') {
                    onTakeExam(exam._id);
                  }
                }}
              >
                {canTakeExam ? 'Take Exam' : 'Not Yet Available'}
              </button>
            </article>
          );
          })}
        </section>
      )}
    </main>
  );
}
