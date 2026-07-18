import { useEffect, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import { organizeExamQuestionsAndAnswers } from '../../lib/DeanTestRunOrganizer.js';
import '../../styles/shared/MockBoardExamPreview.css';
import PageHeader from '../../components/PageHeader.jsx';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

export default function MockBoardExamPreview({ examId, onBack }) {
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [zoomedImage, setZoomedImage] = useState(null);

  useEffect(() => {
    function handleEsc(e) {
      if (e.key === 'Escape') {
        setZoomedImage(null);
      }
    }

    if (zoomedImage) {
      window.addEventListener('keydown', handleEsc);
    }

    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [zoomedImage]);

  useEffect(() => {
    async function fetchExam() {
      if (!examId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(examId)}`);
        if (data.exam) {
          setExam({
            ...data.exam,
            questions: organizeExamQuestionsAndAnswers(data.exam.questions || [])
          });
        } else {
          setError('Exam not found.');
        }
      } catch (err) {
        setError(err.message || 'Failed to load exam preview.');
      } finally {
        setLoading(false);
      }
    }
    fetchExam();
  }, [examId]);

  if (loading) {
    return (
      <div className="mbep-page">
        <div style={{ padding: '80px', textAlign: 'center', color: '#9ba3cb' }}>
          <h3>Loading preview...</h3>
        </div>
      </div>
    );
  }

  if (error || (!exam && examId)) {
    return (
      <div className="mbep-page">
        <header className="mbep-header">
          <div className="mbep-header-info">
            <h1 className="mbep-title">Error</h1>
          </div>
          <button className="mbep-exit-btn" onClick={onBack}>Exit Preview</button>
        </header>
        <div style={{ padding: '80px', textAlign: 'center', color: '#dc2626' }}>
          <p>{error || 'Exam not found.'}</p>
        </div>
      </div>
    );
  }
  if (!exam) {
    return (
      <div className="mbep-page">
        <div style={{ padding: '80px', textAlign: 'center', color: '#9ba3cb' }}>
          <h3>Preparing preview...</h3>
        </div>
      </div>
    );
  }

  const questions = exam.questions || [];
  const currentQuestion = questions[currentIdx];
  const progressPercent = questions.length > 0 ? ((currentIdx + 1) / questions.length) * 100 : 0;

  return (
    <div className="mbep-page">
      {/* ── Header ─────────────────────────────────────────────── */}
      <PageHeader
        className="shared-page-header--bleed-lr"
        title={exam.name}
        subtitle={exam.description || exam.program?.name || 'Academic Program Preview'}
      >
        <button className="mbep-exit-btn" onClick={onBack}>
          Exit Preview
        </button>
      </PageHeader>

      {/* ── Progress ───────────────────────────────────────────── */}
      <div className="mbep-stats">
        <div className="mbep-progress-card">
          <div className="mbep-progress-info">
            <span>Progress</span>
            <span>{currentIdx + 1} / {questions.length}</span>
          </div>
          <div className="mbep-progress-bar">
            <div className="mbep-progress-fill" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>
      </div>

      {/* ── Question Area ───────────────────────────────────────── */}
      <main className="mbep-content">
        {currentQuestion ? (
          <article className="mbep-card">
            <div className="mbep-card-top">
              <h4>Question {currentIdx + 1}</h4>
            </div>
            <div className="mbep-card-body">
              <div className="mbep-question-title">
                {currentQuestion.title}
                {currentQuestion.description && (
                  <p style={{ marginTop: '12px', fontWeight: 400, color: '#6b7280', fontSize: '14px' }}>
                    {currentQuestion.description}
                  </p>
                )}
              </div>

              {currentQuestion.images?.length > 0 && (
                <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {currentQuestion.images.map((img, i) => (
                    <img
                      key={i}
                      src={img.startsWith('/') ? `${BASE}${img}` : img}
                      alt="Ref"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '300px',
                        borderRadius: '8px',
                        border: '1px solid rgba(53, 64, 142, 0.15)',
                        cursor: 'zoom-in'
                      }}
                      onClick={() => {
                        console.log("ZOOM IMAGE (RAW):", img);

                        const finalImage = img.startsWith('/') ? `${BASE}${img}` : img;
                        console.log("ZOOM IMAGE (FINAL):", finalImage);

                        setZoomedImage(finalImage);
                      }}
                    />

                  ))}
                </div>
              )}

              <div className="mbep-options">
                {(currentQuestion.answers || []).map((answer) => (
                  <div
                    key={answer._id}
                    className={`mbep-option ${answer.isCorrect ? 'is-correct' : ''}`}
                  >
                    <div className="mbep-option-circle">{answer.optionLabel}</div>
                    <div className="mbep-option-text">{answer.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ) : (
          <div className="ca-empty">No questions available.</div>
        )}

        {/* ── Navigation ────────────────────────────────────────── */}
        <div className="mbep-navigator-wrap">
          <div className="mbep-nav-bar">
            {questions.map((_, i) => (
              <button
                key={i}
                className={`mbep-nav-circle ${currentIdx === i ? 'active' : ''}`}
                onClick={() => setCurrentIdx(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className="mbep-nav-actions">
            <button
              className="mbep-btn-nav"
              onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
              disabled={currentIdx === 0}
            >
              ← Previous
            </button>
            <button
              className="mbep-btn-nav"
              onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIdx === questions.length - 1}
            >
              Next →
            </button>
          </div>
        </div>
      </main>

      <footer style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#8b92bc', opacity: 0.6 }}>
        NU-BOARD • Mock Board Exam Preview
      </footer>

      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
          }}
        >
          <img
            src={zoomedImage}
            alt="Zoomed"
            style={{
              width: 'auto',
              height: 'auto',
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '10px',
              cursor: 'zoom-out',
              boxShadow: '0 0 25px rgba(255,255,255,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

    </div>
  );
}
