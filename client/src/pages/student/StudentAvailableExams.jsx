import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/shared/AvailableExams.css';
import { useToast } from '../../components/Toast.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchBar from '../../components/SearchBar.jsx';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

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

function formatDuration(durationMinutes) {
  const minutes = Number(durationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return 'N/A';
  const hrs = Math.round((minutes / 60) * 10) / 10;
  return `${minutes}mins (${hrs}hrs)`;
}

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

function SkeletonCard({ keyId }) {
  return (
    <div key={keyId} className="ae-card ae-card--skeleton" aria-hidden="true">
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

export default function AvailableExams({ onTakeExam }) {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [submittedExamIds, setSubmittedExamIds] = useState(new Set());
  const { notify } = useToast();

  useEffect(() => {
    let mounted = true;
    async function fetchExams() {
      setLoading(true);
      try {
        const [data, attempts] = await Promise.all([
          apiAuth(`${BASE}/api/student-exams/available`),
          apiAuth(`${BASE}/api/student-exams/my-attempts`),
        ]);

        if (!mounted) return;
        setExams(Array.isArray(data.exams) ? data.exams : []);

        const taken = new Set(
          (attempts?.attempts || []).map((a) => String(a.examId || a.id || ''))
        );
        setSubmittedExamIds(taken);
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to load exams or attempts:', err);
        setExams([]);
        setSubmittedExamIds(new Set());
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
    return exams
      .filter((exam) => String(exam?.name || '').toLowerCase().includes(q))
      .filter((exam) => selectedStatus === 'all' || exam?.examCardStatus === selectedStatus);
  }, [exams, search, selectedStatus]);

  const statusCounts = useMemo(() => {
    let open = 0;
    let closingSoon = 0;
    let upcoming = 0;
    for (const exam of exams) {
      const status = exam?.examCardStatus;
      if (status === 'open') open += 1;
      else if (status === 'closing_soon') closingSoon += 1;
      else if (status === 'upcoming') upcoming += 1;
    }
    return { all: exams.length, open, closing_soon: closingSoon, upcoming };
  }, [exams]);

  const hasAnyExams = exams.length > 0;
  const hasResults = filteredExams.length > 0;

  return (
    <main className="sae-page-container">

      <PageHeader
        className="shared-page-header--bleed-lr"
        title="Available Exams"
        subtitle="Browse and take available mock board exams for your program"
      />

      <div className="ca-state-pills ae-state-pills" role="tablist" aria-label="Exam status filters">
        <button
          type="button"
          className={`ca-state-pill${selectedStatus === 'all' ? ' ca-state-pill--active' : ''}`}
          onClick={() => setSelectedStatus('all')}
        >
          <span className="ca-state-pill-count">{statusCounts.all}</span>
          <span>All</span>
        </button>
        <button
          type="button"
          className={`ca-state-pill${selectedStatus === 'open' ? ' ca-state-pill--active' : ''}`}
          onClick={() => setSelectedStatus('open')}
        >
          <span className="ca-state-pill-count">{statusCounts.open}</span>
          <span>Open</span>
        </button>
        <button
          type="button"
          className={`ca-state-pill${selectedStatus === 'closing_soon' ? ' ca-state-pill--active' : ''}`}
          onClick={() => setSelectedStatus('closing_soon')}
        >
          <span className="ca-state-pill-count">{statusCounts.closing_soon}</span>
          <span>Closing Soon</span>
        </button>
        <button
          type="button"
          className={`ca-state-pill${selectedStatus === 'upcoming' ? ' ca-state-pill--active' : ''}`}
          onClick={() => setSelectedStatus('upcoming')}
        >
          <span className="ca-state-pill-count">{statusCounts.upcoming}</span>
          <span>Not Yet Open</span>
        </button>
      </div>

      <div className="ca-filters ae-filters">
        <SearchBar
          value={search}
          onChange={setSearch}
          className="ca-search"
          placeholder="Search exams..."
          ariaLabel="Search exams"
        />
      </div>

      {loading && (
        <section className="ae-grid" aria-label="Loading exams">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} keyId={`skel-${i}`} />
          ))}
        </section>
      )}

      {!loading && !hasAnyExams && (
        <div className="ae-empty" role="status">
          No exams are currently available.
        </div>
      )}

      {!loading && hasAnyExams && !hasResults && (
        <div className="ae-empty" role="status">
          No exams found matching your search.
        </div>
      )}

      {!loading && hasResults && (
        <section className="ae-grid" aria-label="Available exams">
          {filteredExams.map((exam) => {
            const isOpen = exam.examCardStatus === 'open';
            const isUpcoming = exam.examCardStatus === 'upcoming';
            const isClosingSoon = exam.examCardStatus === 'closing_soon';

            const cardClass = [
              'ae-card',
              isClosingSoon ? 'ae-card--closing' : 'ae-card--normal',
            ].join(' ');

            const isTaken = submittedExamIds.has(String(exam._id));

            const buttonLabel = isTaken
              ? 'Already Submitted'
              : isUpcoming
                ? 'Not Yet Open'
                : isClosingSoon
                  ? 'Closing Soon — Take Exam →'
                  : 'Take Exam →';

            const buttonDisabled = isUpcoming; // keep upcoming exams truly disabled

            return (
              <article key={exam._id} className={cardClass}>
                <div className="ae-card-body">
                  <h3 className="ae-title">{exam.name}</h3>
                  <div className="ae-subtitle">{exam.program?.name || '-'}</div>

                  <div className="ae-pills">
                    <div className="ae-pill" title="Duration">
                      <IconClock className="ae-pill-icon" />
                      <span>{formatDuration(exam.durationMinutes)}</span>
                    </div>
                    <div className="ae-pill" title="Number of items">
                      <IconList className="ae-pill-icon" />
                      <span>{`${exam.questionCount ?? 0} items`}</span>
                    </div>
                    <div className="ae-pill" title="Exam date">
                      <IconCalendar className="ae-pill-icon" />
                      <span>{formatStartDateTime(exam.startDateTime)}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={[
                    'ae-btn',
                    (buttonDisabled || isTaken) ? 'ae-btn--disabled' : '',
                    isTaken ? 'ae-btn--submitted' : '',
                    isClosingSoon && !buttonDisabled && !isTaken ? 'ae-btn--closing' : '',
                  ].join(' ')}
                  disabled={buttonDisabled}
                  aria-disabled={isTaken ? 'true' : undefined}
                  title={isTaken ? 'You have already completed this exam' : undefined}
                  onClick={() => {
                    if (isTaken) {
                      notify('You have already completed this exam.', { variant: 'error', title: 'Already Submitted' });
                      return;
                    }
                    if (!buttonDisabled && typeof onTakeExam === 'function') {
                      onTakeExam(exam._id);
                    }
                  }}
                >
                  {buttonLabel}
                </button>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
