import { useEffect, useState, useMemo } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/ChairCheatingLogs.css';

const BASE = import.meta.env.VITE_API_URL;

export default function ChairCheatingLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [violationFilter, setViolationFilter] = useState('');
  const [examFilter, setExamFilter] = useState('');

  useEffect(() => {
    async function fetchLogs() {
      try {
        const data = await apiAuth(`${BASE}/api/stats/program-chair/cheating-logs`);
        setLogs(data.logs || []);
      } catch (err) {
        setError(err.message || 'Failed to load cheating logs.');
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, []);

  const violationTypes = useMemo(() => [...new Set(logs.map(l => l.reason))].sort(), [logs]);
  const examNames = useMemo(() => [...new Set(logs.map(l => l.examName))].sort(), [logs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter(log => {
      const matchesSearch =
        !q ||
        log.studentName?.toLowerCase().includes(q) ||
        log.studentEmail?.toLowerCase().includes(q) ||
        log.examName?.toLowerCase().includes(q);
      const matchesViolation = !violationFilter || log.reason === violationFilter;
      const matchesExam = !examFilter || log.examName === examFilter;
      return matchesSearch && matchesViolation && matchesExam;
    });
  }, [logs, search, violationFilter, examFilter]);

  const hasFilters = search || violationFilter || examFilter;

  if (loading) return <div className="cl-loading">Loading cheating logs...</div>;
  if (error) return <div className="cl-loading" style={{ color: 'red' }}>{error}</div>;

  return (
    <div className="cl-page">
      {/* Header */}
      <div className="cl-page-header">
        <div className="cl-header">
          <div>
            <h1 className="cl-title">Cheating Logs</h1>
            <p className="cl-subtitle">
              Each row is one recorded violation. The first two per session are warnings only and are not logged here.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="cl-filters">
        <input
          className="cl-search"
          placeholder="Search by name, email, or exam..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="cl-filter-select"
          value={violationFilter}
          onChange={e => setViolationFilter(e.target.value)}
        >
          <option value="">All Violation Types</option>
          {violationTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          className="cl-filter-select"
          value={examFilter}
          onChange={e => setExamFilter(e.target.value)}
        >
          <option value="">All Exams</option>
          {examNames.map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            className="cl-btn-clear"
            onClick={() => { setSearch(''); setViolationFilter(''); setExamFilter(''); }}
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="cl-helper-note">
        Showing {filtered.length} of {logs.length} violation{logs.length !== 1 ? 's' : ''}
      </p>

      {/* Table */}
      <div className="cl-table-wrap">
        <table className="cl-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Exam</th>
              <th>Violation</th>
              <th>Date / Time</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="cl-empty">
                  {logs.length === 0
                    ? 'No cheating instances recorded for your program.'
                    : 'No results match your filters.'}
                </td>
              </tr>
            ) : (
              filtered.map(log => (
                <tr key={log.id}>
                  <td>
                    <div className="cl-student-name">{log.studentName}</div>
                    <div className="cl-student-email">{log.studentEmail}</div>
                  </td>
                  <td className="cl-exam-name">{log.examName}</td>
                  <td>
                    <span className="cl-badge-violation">{log.reason}</span>
                  </td>
                  <td className="cl-timestamp">
                    {new Date(log.timestamp).toLocaleString('en-PH', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}