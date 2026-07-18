import { useEffect, useState, useRef } from 'react';
import { apiAuth } from '../../lib/api';
import PageHeader from '../../components/PageHeader';
import '../../styles/shared/BulkRegister.css';

export default function BulkRegister({ user }) {
  const [role, setRole] = useState('student');

  // Department/Program Selection
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');

  // Row entries
  const [entries, setEntries] = useState([{ name: '', email: '', studentId: '', alumniId: '' }]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Result state
  const [batchResult, setBatchResult] = useState(null); // null | { status, counts, registered, skippedDuplicates, emailFailures, insertFailures }

  const pollRef = useRef(null);

  // Fetch departments for deans
  useEffect(() => {
    if (user.role === 'dean') {
      apiAuth('/api/catalog/departments')
        .then((data) => setDepartments(data.departments || []))
        .catch((err) => console.error('Failed to fetch departments', err));
    }
  }, [user.role]);

  // Fetch programs when department changes (for Deans)
  useEffect(() => {
    if (user.role === 'dean' && departmentId) {
      apiAuth(`/api/catalog/programs?departmentId=${encodeURIComponent(departmentId)}`)
        .then((data) => setPrograms(data.programs || []))
        .catch((err) => console.error('Failed to fetch programs', err));
    } else {
      setPrograms([]);
    }
  }, [departmentId, user.role]);

  // Cleanup poll on unmount
  useEffect(() => () => clearInterval(pollRef.current), []);

  const handleEntryChange = (index, field, value) => {
    const newEntries = [...entries];
    newEntries[index][field] = value;
    setEntries(newEntries);
  };

  const addRow = () => {
    setEntries([...entries, { name: '', email: '', studentId: '', alumniId: '' }]);
  };

  const removeRow = (index) => {
    if (entries.length > 1) {
      const newEntries = [...entries];
      newEntries.splice(index, 1);
      setEntries(newEntries);
    }
  };

  const pollUntilDone = (batchId) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiAuth(`/api/auth/bulk-register/${batchId}`);
        if (res.status === 'complete' || res.status === 'failed') {
          clearInterval(pollRef.current);
          setBatchResult(res);
          setIsSubmitting(false);
        }
      } catch {
        clearInterval(pollRef.current);
        setError('Could not retrieve batch result. The accounts may have been created — please check the user list.');
        setIsSubmitting(false);
      }
    }, 1500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const filledEntries = entries.filter(
      (e) => e.name.trim() || e.email.trim() || e.studentId.trim() || e.alumniId.trim()
    );

    if (filledEntries.length === 0) {
      setError('Please add at least one valid entry.');
      return;
    }

    if (user.role === 'dean') {
      if (!departmentId) { setError('Please select a department.'); return; }
      if (!programId)    { setError('Please select a program.');    return; }
    }

    setIsSubmitting(true);
    setBatchResult(null);

    try {
      const payload = {
        role,
        departmentId: user.role === 'dean' ? departmentId : undefined,
        programId:    user.role === 'dean' ? programId    : undefined,
        entries: filledEntries.map((entry) => ({
          name:      entry.name.trim(),
          email:     entry.email.trim(),
          studentId: role === 'student' ? entry.studentId.trim() : undefined,
          alumniId:  role === 'alumni'  ? entry.alumniId.trim()  : undefined,
        })),
      };

      const res = await apiAuth('/api/auth/bulk-register', { method: 'POST', body: payload });

      if (res.batchId) {
        // Start polling for the final summary
        pollUntilDone(res.batchId);
      } else {
        // Completed instantly (e.g., all duplicates)
        setBatchResult(res.summary || res);
        setIsSubmitting(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to submit bulk registration.');
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setEntries([{ name: '', email: '', studentId: '', alumniId: '' }]);
    setBatchResult(null);
    setError(null);
  };

  // ── Result screen ──────────────────────────────────────────────────────────
  if (isSubmitting) {
    return (
      <div className="bulk-register-progress">
        <div className="br-spinner" />
        <p className="status processing">Processing registrations… Please wait.</p>
      </div>
    );
  }

  if (batchResult) {
    const counts  = batchResult.counts  || {};
    const details = {
      registered:       batchResult.registered       || [],
      skippedDuplicates: batchResult.skippedDuplicates || [],
      emailFailures:    batchResult.emailFailures     || [],
      insertFailures:   batchResult.insertFailures    || [],
    };

    const allOk = counts.registered > 0 && counts.emailFailures === 0 && counts.insertFailures === 0;

    return (
      <div className="bulk-register-progress">
        <div className={`br-result-icon ${allOk ? 'success' : 'partial'}`}>
          {allOk ? '✓' : '!'}
        </div>
        <h3 className={`br-result-title ${allOk ? 'success' : 'partial'}`}>
          {allOk ? 'Registration Complete' : 'Registration Finished with Issues'}
        </h3>

        <div className="summary-stats">
          <div className="stat-card success">
            <span className="stat-num">{counts.registered ?? 0}</span>
            <span className="stat-label">Registered</span>
          </div>
          {(counts.skippedDuplicates ?? 0) > 0 && (
            <div className="stat-card warning">
              <span className="stat-num">{counts.skippedDuplicates}</span>
              <span className="stat-label">Skipped (Duplicates)</span>
            </div>
          )}
          {(counts.emailFailures ?? 0) > 0 && (
            <div className="stat-card error">
              <span className="stat-num">{counts.emailFailures}</span>
              <span className="stat-label">Email Failures</span>
            </div>
          )}
          {(counts.insertFailures ?? 0) > 0 && (
            <div className="stat-card error">
              <span className="stat-num">{counts.insertFailures}</span>
              <span className="stat-label">Insert Failures</span>
            </div>
          )}
        </div>

        {details.skippedDuplicates.length > 0 && (
          <details className="br-details">
            <summary>Skipped Duplicates ({details.skippedDuplicates.length})</summary>
            <ul>
              {details.skippedDuplicates.map((d, i) => (
                <li key={i}>{d.email} — {d.reason}</li>
              ))}
            </ul>
          </details>
        )}

        {details.emailFailures.length > 0 && (
          <details className="br-details">
            <summary>Email Failures ({details.emailFailures.length})</summary>
            <ul>
              {details.emailFailures.map((d, i) => (
                <li key={i}>{d.email} — {d.error}</li>
              ))}
            </ul>
          </details>
        )}

        {details.insertFailures.length > 0 && (
          <details className="br-details">
            <summary>Insert Failures ({details.insertFailures.length})</summary>
            <ul>
              {details.insertFailures.map((d, i) => (
                <li key={i}>{d.email} — {d.reason}</li>
              ))}
            </ul>
          </details>
        )}

        <button className="br-btn br-btn-primary" onClick={resetForm}>
          Register Another Batch
        </button>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="bulk-register-container">
      <div className="br-header-info">
        <p>Register multiple students or alumni at once. Temporary passwords will be generated and emailed to them automatically.</p>
      </div>

      {error && <div className="error-alert">{error}</div>}

      <form onSubmit={handleSubmit} className="bulk-register-form">
        <div className="br-controls">
          <div className="form-group">
            <label>Registration Type</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSubmitting}>
              <option value="student">Student</option>
              <option value="alumni">Alumni</option>
            </select>
          </div>

          {user.role === 'dean' && (
            <>
              <div className="form-group">
                <label>Department</label>
                <select
                  value={departmentId}
                  onChange={(e) => { setDepartmentId(e.target.value); setProgramId(''); }}
                  disabled={isSubmitting}
                >
                  <option value="">-- Select Department --</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>{d.code} - {d.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Program</label>
                <select
                  value={programId}
                  onChange={(e) => setProgramId(e.target.value)}
                  disabled={isSubmitting || !departmentId}
                >
                  <option value="">-- Select Program --</option>
                  {programs.map((p) => (
                    <option key={p._id} value={p._id}>{p.code} - {p.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="br-entries">
          <div className="br-entries-header">
            <div className="col">Full Name</div>
            <div className="col">Email Address</div>
            {role === 'student' && <div className="col">Student ID</div>}
            {role === 'alumni'  && <div className="col">Alumni ID</div>}
            <div className="col-action"></div>
          </div>

          {entries.map((entry, index) => (
            <div key={index} className="br-entry-row">
              <div className="col">
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={entry.name}
                  onChange={(e) => handleEntryChange(index, 'name', e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="col">
                <input
                  type="email"
                  placeholder="e.g. john@nu-laguna.edu.ph"
                  value={entry.email}
                  onChange={(e) => handleEntryChange(index, 'email', e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              {role === 'student' && (
                <div className="col">
                  <input
                    type="text"
                    placeholder="YYYY-XXXXXX"
                    value={entry.studentId}
                    onChange={(e) => handleEntryChange(index, 'studentId', e.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </div>
              )}
              {role === 'alumni' && (
                <div className="col">
                  <input
                    type="text"
                    placeholder="YYYY-XXXXXX"
                    value={entry.alumniId}
                    onChange={(e) => handleEntryChange(index, 'alumniId', e.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </div>
              )}
              <div className="col-action">
                <button
                  type="button"
                  className="br-btn-icon"
                  onClick={() => removeRow(index)}
                  disabled={entries.length === 1 || isSubmitting}
                  title="Remove row"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="br-actions">
          <button type="button" className="br-btn br-btn-secondary" onClick={addRow} disabled={isSubmitting}>
            + Add Row
          </button>
          <button type="submit" className="br-btn br-btn-primary" disabled={isSubmitting}>
            Register Batch
          </button>
        </div>
      </form>
    </div>
  );
}
