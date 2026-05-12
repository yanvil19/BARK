import React from 'react';
import '../../styles/Dashboard.css';
import PageHeader from '../../components/PageHeader.jsx';

const ProfessorDashboard = ({ me }) => {
  return (
    <main>
      <PageHeader
        title={`Welcome, Professor ${me?.firstName || 'Professor'}`}
        subtitle="Professor dashboard content coming soon."
      />
    </main>
  );
};

export default ProfessorDashboard;
