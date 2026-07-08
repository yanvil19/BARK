import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/AvailableExams.css';
import PageHeader from '../../components/PageHeader.jsx';
import '../../styles/QuestionApprovals.css';

const BASE = import.meta.env.VITE_API_URL;

function IconList(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M8 6h13M8 12h13M8 18h13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
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

export default function AlumniAvailableExams({ onTakeExam, onViewResults }) {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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
    return exams.filter((exam) => String(exam?.name || '').toLowerCase().includes(q));
  }, [exams, search]);

  const hasAnyExams = exams.length > 0;
  const hasResults = filteredExams.length > 0;

  return (
    <main className="sae-page-container">
      <PageHeader
        className="shared-page-header--bleed-lr"
        title="Available Exams"
        subtitle="Browse and retake available alumni mock board exams for your program"
      />

      <div className="ca-state-pills ae-state-pills" role="tablist" aria-label="Exam status filters">
        <button type="button" className="ca-state-pill ca-state-pill--active">
          <span className="ca-state-pill-count">{exams.length}</span>
          <span>Available</span>
        </button>
      </div>

      <div className="ca-filters ae-filters">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ca-search"
          placeholder="Search exams..."
          aria-label="Search exams"
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
          No alumni exams are currently available.
        </div>
      )}

      {!loading && hasAnyExams && !hasResults && (
        <div className="ae-empty" role="status">
          No exams found matching your search.
        </div>
      )}

      {!loading && hasResults && (
        <section className="ae-grid" aria-label="Available alumni exams">
          {filteredExams.map((exam) => (
            <article key={exam._id} className="ae-card ae-card--normal">
              <div className="ae-card-body">
                <h3 className="ae-title">{exam.name}</h3>
                <div className="ae-subtitle">{exam.program?.name || '-'}</div>

                <div className="ae-pills">
                  <div className="ae-pill" title="Number of items">
                    <IconList className="ae-pill-icon" />
                    <span>{`${exam.questionCount ?? 0} items`}</span>
                  </div>
                  <div className="ae-pill" title="Availability">
                    <span>Available now</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="ae-btn"
                onClick={() => {
                  if (typeof onTakeExam === 'function') {
                    onTakeExam(exam._id);
                  }
                }}
              >
                Take Exam
              </button>

              <button
                type="button"
                className="ae-btn ae-btn--normal"
                onClick={() => {
                  if (typeof onViewResults === 'function') {
                    onViewResults(exam._id);
                  }
                }}
              >
                View Attempts
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
