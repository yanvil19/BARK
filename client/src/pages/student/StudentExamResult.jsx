import React from 'react';
import '../styles/MockBoardExamPreview.css';

export default function StudentExamResult({ onReturn }) {
  return (
    <div className="mbep-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-color)' }}>
      <div className="mbep-card" style={{ maxWidth: '600px', width: '100%', textAlign: 'center', padding: '40px' }}>
        <h1 style={{ fontFamily: 'var(--font-title)', color: 'var(--primary-bg)', marginBottom: '15px' }}>
          Mock Exam Completed Successfully
        </h1>
        <p style={{ color: '#555', fontSize: '16px', lineHeight: '1.6', marginBottom: '30px' }}>
          Your answers have been recorded and submitted to the system. 
          Your results will be reviewed by the Dean and released at a later date.
        </p>
        <button 
          onClick={onReturn}
          className="mbep-btn-nav"
          style={{ background: 'var(--primary-bg)', color: '#fff', border: 'none', padding: '10px 24px' }}
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}
