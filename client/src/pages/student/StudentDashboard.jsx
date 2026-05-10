import React from 'react';
import '../../styles/Dashboard.css';

const StudentDashboard = ({ me, onNavigate }) => {
  return (
    <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Welcome, {me?.firstName || 'Student'}</h1>
      
      <section style={{ marginTop: '30px' }}>
        <div style={{ border: '1px solid var(--border-color)', padding: '30px', borderRadius: '8px', background: '#fff', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <h2 style={{ marginBottom: '15px' }}>Mock Board Exams</h2>
          <p style={{ color: '#555', marginBottom: '25px' }}>
            Check if you have any mock board exams scheduled for your program.
          </p>
          <button 
            onClick={() => onNavigate('studentAvailableExams')}
            style={{ padding: '12px 24px', background: 'var(--primary-bg)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
          >
            View Available Exams
          </button>
        </div>
      </section>
    </main>
  );
};

export default StudentDashboard;
