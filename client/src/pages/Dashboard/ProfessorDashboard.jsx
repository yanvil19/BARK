import React from 'react';
import '../../styles/Dashboard.css';

const ProfessorDashboard = ({ me }) => {
  return (
    <main>
      <h1>Welcome, Professor {me?.firstName || 'Professor'}</h1>
      <p>Professor dashboard content coming soon.</p>
    </main>
  );
};

export default ProfessorDashboard;
