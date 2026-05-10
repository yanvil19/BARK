import React, { useState, useEffect } from 'react';
import { apiAuth } from '../lib/api';
import '../styles/Dashboard.css';

const BASE = 'http://localhost:5000';

const StudentAvailableExams = ({ onTakeExam }) => {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchExams() {
      try {
        const data = await apiAuth(`${BASE}/api/student-exams/available`);
        setExams(data.exams || []);
      } catch (err) {
        console.error('Failed to load exams', err);
      } finally {
        setLoading(false);
      }
    }
    fetchExams();
  }, []);

  return (
    <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Available Exams</h1>
      <p style={{ marginBottom: '30px', color: '#555' }}>
        Below are the mock board exams currently available for your program.
      </p>

      {loading ? (
          <p>Loading exams...</p>
      ) : exams.length === 0 ? (
          <p>No exams are currently available for your program.</p>
      ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {exams.map(exam => {
                  const now = new Date();
                  const start = new Date(exam.startDateTime);
                  const isFuture = now < start;

                  return (
                      <div key={exam._id} style={{ border: '1px solid var(--border-color)', padding: '20px', borderRadius: '8px', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                          <h3 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: 'var(--primary-bg)' }}>{exam.name}</h3>
                          <p style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#555', lineHeight: '1.5' }}>
                              {exam.description && <span>{exam.description}<br/><br/></span>}
                              <strong>Window:</strong> {start.toLocaleString()} to {new Date(exam.endDateTime).toLocaleString()}<br/>
                              <strong>Duration:</strong> {exam.durationMinutes} minutes
                          </p>
                          <button 
                              onClick={() => onTakeExam(exam._id)}
                              disabled={isFuture}
                              style={{ 
                                padding: '10px 20px', 
                                background: isFuture ? '#ccc' : 'var(--primary-bg)', 
                                color: '#fff', 
                                border: 'none', 
                                borderRadius: '4px', 
                                cursor: isFuture ? 'not-allowed' : 'pointer', 
                                fontWeight: 'bold' 
                              }}
                          >
                              {isFuture ? 'Not Yet Started' : 'Open Exam'}
                          </button>
                      </div>
                  );
              })}
          </div>
      )}
    </main>
  );
};

export default StudentAvailableExams;
