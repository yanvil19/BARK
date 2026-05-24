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

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [search, violationFilter, examFilter]);

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

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
              paginated.map(log => (
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
      {totalPages > 1 && (
        <div className="cl-pagination">
          <div className="cl-pagination-info">
            Showing {filtered.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} violation{filtered.length !== 1 ? 's' : ''}
          </div>
          <div className="cl-pagination-controls">
            <button className="cl-pagination-btn" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>← Previous</button>
            <div className="cl-pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  className={`cl-pagination-page ${currentPage === page ? 'cl-pagination-page--active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
            </div>
            <button className="cl-pagination-btn" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}