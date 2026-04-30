import React, { useEffect, useState } from 'react';
import SuperAdminDashboard from './SuperAdminDashboard.jsx';
import DeanDashboard from './DeanDashboard.jsx';
import ProgramChairDashboard from './ProgramChairDashboard.jsx';
import StudentDashboard from './StudentDashboard.jsx';
import ProfessorDashboard from './ProfessorDashboard.jsx';

const Dashboard = ({ me, onNavigate, onRoute }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch general stats needed by Super Admin and others
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const statsRes = await fetch('http://localhost:5000/api/stats/summary');
        const statsData = await statsRes.json();
        setStats(statsData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading stats data:', error);
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading && me?.role === 'super_admin') {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  // Route to appropriate dashboard based on user role
  switch (me?.role) {
    case 'super_admin':
      return <SuperAdminDashboard onNavigate={onNavigate || onRoute} stats={stats} />;
    
    case 'dean':
      return <DeanDashboard me={me} />;
    
    case 'program_chair':
      return <ProgramChairDashboard me={me} onRoute={onRoute} />;
    
    case 'student':
      return <StudentDashboard me={me} />;
    
    case 'professor':
      return <ProfessorDashboard me={me} />;
    
    default:
      return (
        <main>
          <h1>Welcome, {me?.firstName || 'User'}</h1>
          <p>Your role ({me?.role}) dashboard is not yet configured.</p>
        </main>
      );
  }
};

export default Dashboard;
