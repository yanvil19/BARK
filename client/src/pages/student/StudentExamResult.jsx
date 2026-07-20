import React from 'react';
import '../../styles/shared/StudentExamResult.css';

const COMPLETION_POINTS = [
  {
    title: 'Answers Saved',
    description: 'Every response has been recorded and locked into your attempt.',
  },
  {
    title: 'Submission Sent',
    description: 'Your mock board exam is now queued for dean review and validation.',
  },
  {
    title: 'Results Follow Later',
    description: 'Scores will appear once the official release schedule has been set.',
  },
];

function SuccessSeal() {
  return (
    <div className="serc-seal" aria-hidden="true">
      <div className="serc-seal-orbit serc-seal-orbit--one" />
      <div className="serc-seal-orbit serc-seal-orbit--two" />
      <div className="serc-seal-core">
        <svg viewBox="0 0 24 24" className="serc-seal-check">
          <path
            d="M20 7L10 17l-6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className="serc-seal-dot serc-seal-dot--one" />
      <span className="serc-seal-dot serc-seal-dot--two" />
      <span className="serc-seal-dot serc-seal-dot--three" />
    </div>
  );
}

export default function StudentExamResult({ onReturn }) {
  return (
    <main className="serc-page">
      <div className="serc-backdrop serc-backdrop--left" aria-hidden="true" />
      <div className="serc-backdrop serc-backdrop--right" aria-hidden="true" />

      <section className="serc-card">
        <div className="serc-topbar">
          <span className="serc-badge">Submission Received</span>
          <span className="serc-badge serc-badge--muted">Mock Board Exam</span>
        </div>

        <div className="serc-hero">
          <SuccessSeal />

          <div className="serc-copy">
            <p className="serc-eyebrow">Well done</p>
            <h1 className="serc-title">Mock Exam Completed Successfully</h1>
            <p className="serc-description">
              Your answers have been recorded and submitted to the system. Your results will be
              reviewed by the Dean and released at a later date.
            </p>
          </div>
        </div>

        <div className="serc-points" aria-label="Completion summary">
          {COMPLETION_POINTS.map((point) => (
            <article key={point.title} className="serc-point-card">
              <div className="serc-point-icon" aria-hidden="true">
                <span />
              </div>
              <div className="serc-point-copy">
                <h2>{point.title}</h2>
                <p>{point.description}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="serc-footer">
          <button type="button" onClick={onReturn} className="serc-primary-btn">
            Return to Dashboard
          </button>
          <p className="serc-footer-note">
            Take a breather. Your submission is safely in, and the rest is now in the review queue.
          </p>
        </div>
      </section>
    </main>
  );
}
