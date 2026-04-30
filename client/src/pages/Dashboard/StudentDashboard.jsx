import React from 'react';
import '../../styles/Dashboard.css';

const StudentDashboard = ({ me }) => {
  return (
    <main>
      <h1>Welcome, {me?.firstName || 'Student'}</h1>
      <p>Student dashboard content coming soon.</p>
    </main>
  );
};

export default StudentDashboard;
