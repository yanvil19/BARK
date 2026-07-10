import React from 'react';
import '../../styles/StudentExamResult.css';

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

export default function AlumniExamResult({ onReturn, onViewResults }) {
  return (
    <main className="serc-page">
      <div className="serc-backdrop serc-backdrop--left" aria-hidden="true" />
      <div className="serc-backdrop serc-backdrop--right" aria-hidden="true" />

      <section className="serc-card">
        <div className="serc-topbar">
          <span className="serc-badge">Submission Received</span>
          <span className="serc-badge serc-badge--muted">Alumni Exam</span>
        </div>

        <div className="serc-hero">
          <SuccessSeal />

          <div className="serc-copy">
            <p className="serc-eyebrow">Well done</p>
            <h1 className="serc-title">Exam Attempt Completed Successfully</h1>
            <p className="serc-description">
              Your answers have been recorded and scored. You can review your attempt history
              immediately.
            </p>
          </div>
        </div>

        <div className="serc-footer">
          <button type="button" onClick={onViewResults} className="serc-primary-btn">
            View Attempt History
          </button>
          <button type="button" onClick={onReturn} className="serc-primary-btn">
            Return to Available Exams
          </button>
        </div>
      </section>
    </main>
  );
}
