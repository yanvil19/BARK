import React, { useEffect, useState } from 'react';
import SuperAdminDashboard from '../admin/SuperAdminDashboard.jsx';
import DeanDashboard from '../dean/DeanDashboard.jsx';
import ProgramChairDashboard from '../chair/ProgramChairDashboard.jsx';
import StudentDashboard from '../student/StudentDashboard.jsx';
import ProfessorDashboard from '../professor/ProfessorDashboard.jsx';

const Dashboard = ({ me, onNavigate, onRoute }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch general stats needed by Super Admin and others
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setError('');
        // [FIX 1 - REMOVE HARDCODED URL]
        const statsRes = await fetch(`${import.meta.env.VITE_API_URL}/api/stats/summary`);
        if (!statsRes.ok) throw new Error(`Request failed (${statsRes.status})`);
        const statsData = await statsRes.json();
        setStats(statsData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading stats data:', error);
        setError(error?.message || 'Something went wrong. Please try again.');
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading && me?.role === 'super_admin') {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  if (error && me?.role === 'super_admin') {
    return <div className="dashboard-loading">Something went wrong. Please try again.</div>;
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
      return <StudentDashboard me={me} onNavigate={onNavigate || onRoute} />;

    case 'alumni':
      return <StudentDashboard me={me} onNavigate={onNavigate || onRoute} />;
    
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
