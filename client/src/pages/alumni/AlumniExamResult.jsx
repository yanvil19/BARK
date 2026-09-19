import React from 'react';
import '../../styles/shared/StudentExamResult.css';

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
  const isOffline = !navigator.onLine;

  return (
    <main className="serc-page">
      <div className="serc-backdrop serc-backdrop--left" aria-hidden="true" />
      <div className="serc-backdrop serc-backdrop--right" aria-hidden="true" />

      <section className="serc-card">
        <div className="serc-topbar">
          <span className="serc-badge">{isOffline ? 'Saved Locally (Offline)' : 'Submission Received'}</span>
          <span className="serc-badge border-slate-300 serc-badge--muted">Alumni Exam</span>
        </div>

        <div className="serc-hero">
          <SuccessSeal />

          <div className="serc-copy">
            <p className="serc-eyebrow">Well done</p>
            <h1 className="serc-title">
              {isOffline ? 'Exam Saved Offline' : 'Exam Attempt Completed Successfully'}
            </h1>
            <p className="serc-description">
              {isOffline
                ? 'Your answers are safely saved on this device. Once you reconnect to the internet, click "Sync Now" in the header or dashboard to submit and view your official score.'
                : 'Your answers have been recorded and scored. You can review your attempt history immediately.'}
            </p>
          </div>
        </div>

        <div className="serc-footer">
          {!isOffline && (
            <button type="button" onClick={onViewResults} className="serc-primary-btn">
              View Attempt History
            </button>
          )}
          <button
            type="button"
            onClick={onReturn}
            className={isOffline ? 'serc-primary-btn' : 'serc-secondary-btn'}
          >
            Return to Available Exams
          </button>
        </div>
      </section>
    </main>
  );
}
