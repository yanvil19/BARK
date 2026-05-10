import React, { useEffect, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/Dashboard.css';

const SuperAdminDashboard = ({ onNavigate, stats }) => {
  const navigate = onNavigate || (() => {});
  const [adminDepts, setAdminDepts] = useState([]);
  const [adminPrograms, setAdminPrograms] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [totalLogsPages, setTotalLogsPages] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLogsLoading(true);
    (async () => {
      try {
        const [deptRes, progRes, logRes] = await Promise.all([
          apiAuth('/api/admin/catalog/departments?limit=200'),
          apiAuth('/api/admin/catalog/programs?limit=200'),
          apiAuth(`/api/stats/audit-logs?limit=5&page=${logsPage}`)
        ]);
        if (cancelled) return;
        setAdminDepts(deptRes.departments || []);
        setAdminPrograms(progRes.programs || []);
        setAuditLogs(logRes.logs || []);
        setTotalLogsPages(logRes.pages || 1);
      } catch (err) {
        console.error('Failed to load admin dashboard data:', err.message);
      } finally {
        if (!cancelled) setLogsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [logsPage]);

  const formatAuditAction = (action = '') => action.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());

  const programCountByDept = adminPrograms.reduce((acc, prog) => {
    const deptId = String(prog.department?._id || prog.department || '');
    acc[deptId] = (acc[deptId] || 0) + 1;
    return acc;
  }, {});

  return (
    <main className="dashboard-sa-main">
      <header className="dashboard-sa-header">
        <h1>Dashboard</h1>
        <p>National University Laguna • Super Admin Portal</p>
      </header>

      <div className="dashboard-sa-top-grid">
        <section className="dashboard-box">
          <div className="box-title">Question Repository</div>
          <div className="box-content-vertical">
            <div className="metric-card metric-card-blue">
              <h2>{stats?.questions?.total || 0}</h2>
              <p>Total Questions</p>
            </div>
            <div className="metric-card metric-card-yellow" style={{ marginTop: '10px' }}>
              <h2>{stats?.questions?.pending || 0}</h2>
              <p>Pending Review</p>
            </div>
          </div>
        </section>

        <section className="dashboard-box box-wide">
          <div className="box-title">System Users</div>
          <div className="box-content-grid">
            <div className="metric-card metric-card-blue"><h2>{stats?.users?.student?.active || 0}</h2><p>Students</p></div>
            <div className="metric-card metric-card-blue"><h2>{stats?.users?.professor?.active || 0}</h2><p>Professors</p></div>
            <div className="metric-card metric-card-blue"><h2>{stats?.users?.program_chair?.active || 0}</h2><p>Chairs</p></div>
            <div className="metric-card metric-card-blue"><h2>{stats?.users?.dean?.active || 0}</h2><p>Deans</p></div>
            <div className="metric-card metric-card-blue"><h2>{stats?.users?.super_admin?.active || 0}</h2><p>Admins</p></div>
            <div className="metric-card metric-card-yellow" onClick={() => navigate('adminUsers')} style={{ cursor: 'pointer' }}>
              <h2>{(stats?.pendingAccounts?.students || 0) + (stats?.pendingAccounts?.alumni || 0)}</h2>
              <p>Pending Req.</p>
            </div>
          </div>
        </section>

        <section className="dashboard-box">
          <div className="box-title">Database</div>
          <div className="box-content-center">
            <div className="db-gauge-container">
              <div className="db-gauge-fill" style={{ height: `${Math.min(stats?.database?.percentUsed || 0, 100)}%` }} />
            </div>
            <div className="db-gauge-label">
              {stats?.database?.percentUsed || 0}% Used
            </div>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{stats?.database?.totalSizeMB || 0}MB / 512MB</p>
          </div>
        </section>
      </div>

      <section className="dashboard-table-section" style={{ margin: '0 20px 24px' }}>
        <div className="table-section-header">
          <div>
            <h2 style={{ fontSize: '18px' }}>Recent Audit Logs</h2>
            <p style={{ fontSize: '12px' }}>Latest system changes and admin actions</p>
          </div>
        </div>
        <table className="modern-table">
          <thead>
            <tr>
              <th>Admin</th>
              <th>Action</th>
              <th>Target</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {logsLoading ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>Loading logs...</td></tr>
            ) : auditLogs.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>No audit logs found.</td></tr>
            ) : (
              auditLogs.map(log => (
                <tr key={log._id}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: '600', color: 'var(--primary-bg)' }}>{log.admin?.name || 'Unknown'}</span>
                      <span style={{ fontSize: '11px', color: '#888' }}>{log.admin?.email}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="pill" style={{ background: '#f0f4ff', color: '#1a43bf', textTransform: 'capitalize', fontSize: '12px' }}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '13px' }}>
                      <strong style={{ color: '#fad227' }}>{log.targetType}</strong>
                      {log.details?.name && <span style={{ color: '#666' }}> ({log.details.name})</span>}
                      {log.details?.userEmail && <span style={{ color: '#666' }}> ({log.details.userEmail})</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: '12px', color: '#666' }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="audit-pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#f9faff', borderTop: '1px solid #e1e3ed' }}>
          <span style={{ fontSize: '12px', color: '#888' }}>Page {logsPage} of {totalLogsPages}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="pag-btn" 
              onClick={() => setLogsPage(p => Math.max(1, p - 1))}
              disabled={logsPage === 1}
            >Previous</button>
            <button 
              className="pag-btn" 
              onClick={() => setLogsPage(p => Math.min(totalLogsPages, p + 1))}
              disabled={logsPage === totalLogsPages}
            >Next</button>
          </div>
        </div>
      </section>

      <div className="dashboard-sa-bottom-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', padding: '0 20px 24px' }}>
        <section className="dashboard-table-section" style={{ margin: 0 }}>
          <div className="table-section-header">
            <div>
              <h2 style={{ fontSize: '18px' }}>Schools</h2>
              <p style={{ fontSize: '12px' }}>{adminDepts.length} Registered</p>
            </div>
            <button className="view-btn" onClick={() => navigate('schoolsPrograms')}>Manage</button>
          </div>
          <table className="modern-table">
            <thead>
              <tr><th>Code</th><th>School Name</th><th>Users</th><th>Status</th></tr>
            </thead>
            <tbody>
              {adminDepts.slice(0, 5).map(dept => (
                <tr key={dept._id}>
                  <td><span className="pill-nu">{dept.code}</span></td>
                  <td style={{ fontSize: '13px' }}>{dept.name}</td>
                  <td style={{ textAlign: 'center', fontWeight: '600' }}>
                    {stats?.academic?.deptUserCounts?.[String(dept._id)] || 0}
                  </td>
                  <td>
                    <span className={`status-text ${dept.isActive ? 'active' : 'inactive'}`}>
                      • {dept.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="dashboard-table-section" style={{ margin: 0 }}>
          <div className="table-section-header">
            <div>
              <h2 style={{ fontSize: '18px' }}>Programs</h2>
              <p style={{ fontSize: '12px' }}>{adminPrograms.length} Registered</p>
            </div>
            <button className="view-btn" onClick={() => navigate('schoolsPrograms')}>Manage</button>
          </div>
          <table className="modern-table">
            <thead>
              <tr><th>Code</th><th>Program Name</th><th>Users</th><th>Status</th></tr>
            </thead>
            <tbody>
              {adminPrograms.slice(0, 5).map(prog => (
                <tr key={prog._id}>
                  <td><span className="pill-nu">{prog.code}</span></td>
                  <td style={{ fontSize: '13px' }}>{prog.name}</td>
                  <td style={{ textAlign: 'center', fontWeight: '600' }}>
                    {stats?.academic?.progUserCounts?.[String(prog._id)] || 0}
                  </td>
                  <td>
                    <span className={`status-text ${prog.isActive ? 'active' : 'inactive'}`}>
                      • {prog.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
};

export default SuperAdminDashboard;
