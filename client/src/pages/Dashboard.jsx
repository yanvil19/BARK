import React, { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import SuperAdminDashboard from './superadmin/SAdminDashboard.jsx';
import DeanDashboard from './dean/DeanDashboard.jsx';
import ProgramChairDashboard from './programchair/PCDashboard.jsx';
import LearnerDashboard from './shared/LearnerDashboard.jsx';
import ProfessorDashboard from './prof/ProfDashboard.jsx';

const Dashboard = ({ me, onNavigate, onRoute, onTakeExam, onViewResults, onMeRefresh }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch general stats needed by Super Admin and others
  useEffect(() => {
    if (me?.role !== 'super_admin') {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        setError('');
        // [FIX 1 - REMOVE HARDCODED URL]
        const statsData = await apiAuth('/api/stats/summary');
        setStats(statsData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading stats data:', error);
        setError(error?.message || 'Something went wrong. Please try again.');
        setLoading(false);
      }
    };
    fetchStats();
  }, [me?.role]);

  if (loading && me?.role === 'super_admin') {
    return <div className="dashboard-loading page-shell">Loading dashboard...</div>;
  }

  if (error && me?.role === 'super_admin') {
    return <div className="dashboard-loading page-shell">Something went wrong. Please try again.</div>;
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
    case 'alumni':
      return (
        <LearnerDashboard
          me={me}
          audience={me.role}
          onNavigate={onNavigate || onRoute}
          onTakeExam={onTakeExam}
          onViewResults={onViewResults}
          onMeRefresh={onMeRefresh}
        />
      );
    
    case 'professor':
      return <ProfessorDashboard me={me} />;
    
    default:
      return (
        <main className="page-shell">
          <h1>Welcome, {me?.firstName || 'User'}</h1>
          <p>Your role ({me?.role}) dashboard is not yet configured.</p>
        </main>
      );
  }
};

export default Dashboard;
