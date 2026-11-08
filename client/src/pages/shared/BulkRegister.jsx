import { useEffect, useRef, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import { Modal } from '../../components/Modal.jsx';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import FieldCheck from '../../components/FieldCheck.jsx';
import TrashButton from '../../components/TrashButton.jsx';
import { useToast } from '../../components/Toast.jsx';
import '../../styles/components/QuestionForm.css';
import '../../styles/shared/BulkRegister.css';

const DRAFT_KEY = 'draft_bulk_registration';
// How often a running batch is asked whether it has finished
const POLL_MS = 1500;
// The server's limit for one batch
const MAX_ROWS = 500;
// The server checks the same: 4-digit year, dash, 6-digit number
const ID_PATTERN = /^\d{4}-\d{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_OPTIONS = [
  { value: 'student', label: 'Students' },
  { value: 'alumni', label: 'Alumni' },
];

let nextRowId = 1;
function newRow(values = {}) {
  return { id: nextRowId++, name: '', email: '', studentId: '', alumniId: '', ...values };
}

function idField(role) {
  return role === 'alumni' ? 'alumniId' : 'studentId';
}

function idLabel(role) {
  return role === 'alumni' ? 'Alumni ID' : 'Student ID';
}

function isRowStarted(row) {
  return Boolean(row.name.trim() || row.email.trim() || row.studentId.trim() || row.alumniId.trim());
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// What is wrong with each started row, by row id: [{ field: 'name' | 'email' | 'id', message }]
function checkRows(rows, role) {
  const errors = {};
  rows.forEach((row) => {
    const problems = [];
    if (!row.name.trim()) problems.push({ field: 'name', message: 'Enter the full name.' });
    if (!EMAIL_PATTERN.test(row.email.trim())) problems.push({ field: 'email', message: 'Enter a valid email.' });
    if (!ID_PATTERN.test(row[idField(role)].trim())) {
      problems.push({ field: 'id', message: `Enter the ${idLabel(role)} as YYYY-XXXXXX.` });
    }
    if (problems.length > 0) errors[row.id] = problems;
  });
  return errors;
}

// The field a server message is about, or null when it doesn't say
function fieldOfMessage(message) {
  if (/name/i.test(message)) return 'name';
  if (/email/i.test(message)) return 'email';
  if (/\bID\b/.test(message)) return 'id';
  return null;
}

function readDraft() {
  try {
    const draft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
    if (!draft) return null;
    const rows = Array.isArray(draft.entries)
      ? draft.entries.map((entry) => newRow({
        name: entry.name || '',
        email: entry.email || '',
        studentId: entry.studentId || '',
        alumniId: entry.alumniId || '',
      }))
      : [];
    return {
      role: draft.role === 'alumni' ? 'alumni' : 'student',
      programId: draft.programId || '',
      rows: rows.length > 0 ? rows : [newRow()],
    };
  } catch {
    return null;
  }
}

// The list of names under a result: who was registered, and who wasn't and why
function ResultList({ title, items, describe }) {
  if (items.length === 0) return null;
  return (
    <section className="qf-section">
      <div className="qf-section-header">
        <h3 className="qf-section-title">{title} ({items.length})</h3>
      </div>
      <ul className="br-result-list">
        {items.map((item, index) => (
          <li key={`${item.email}-${index}`} className="br-result-item">
            <span className="br-result-name">{item.name || item.email}</span>
            <span className="br-result-detail">{describe(item)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The "Register Accounts" window: who to register (students or alumni), into which program (deans
// pick one; a chair's is their own), and a row per person. The rows are kept as a draft in this
// browser until they are registered. The registering carries on if the window is closed, and the
// page hears when it finishes.
export default function BulkRegister({ user, open, onClose, onFinished }) {
  const { notify } = useToast();
  const isDean = user?.role === 'dean';
  const [draft] = useState(readDraft);
  const [role, setRole] = useState(draft?.role || 'student');
  const [programId, setProgramId] = useState(draft?.programId || '');
  const [rows, setRows] = useState(draft?.rows || [newRow()]);
  const [programs, setPrograms] = useState([]);
  const [rowErrors, setRowErrors] = useState({});
  const [error, setError] = useState('');
  // form, then working while the server registers, then done with its summary
  const [phase, setPhase] = useState('form');
  const [workingCount, setWorkingCount] = useState(0);
  const [summary, setSummary] = useState(null);
  const pollRef = useRef(null);
  const openRef = useRef(open);
  const lastRowRef = useRef(null);
  const focusNewRow = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => () => clearTimeout(pollRef.current), []);

  // A dean registers into one of their department's programs
  useEffect(() => {
    if (!isDean) return undefined;
    const departmentId = user.department?._id || user.department;
    if (!departmentId) return undefined;
    let ignore = false;
    apiAuth(`/api/catalog/programs?departmentId=${encodeURIComponent(departmentId)}`)
      .then((data) => {
        if (ignore) return;
        const list = data.programs || [];
        setPrograms(list);
        setProgramId((current) => {
          if (current && list.some((program) => String(program._id) === String(current))) return current;
          return list.length === 1 ? list[0]._id : '';
        });
      })
      .catch(() => {
        if (!ignore) setError('Programs could not be loaded. Close this window and try again.');
      });
    return () => {
      ignore = true;
    };
  }, [isDean, user?.department]);

  // The draft: kept a moment after each change, and dropped once there is nothing in it
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const entries = rows
          .filter(isRowStarted)
          .map(({ name, email, studentId, alumniId }) => ({ name, email, studentId, alumniId }));
        if (entries.length === 0 && role === 'student') {
          window.localStorage.removeItem(DRAFT_KEY);
          return;
        }
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ role, programId, entries }));
      } catch {
        // Storage can be full or blocked; the form still works without its draft
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [role, programId, rows]);

  useEffect(() => {
    if (!focusNewRow.current) return;
    focusNewRow.current = false;
    lastRowRef.current?.focus();
  }, [rows.length]);

  const startedRows = rows.filter(isRowStarted);

  function updateRow(id, field, value) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    if (rowErrors[id]) {
      setRowErrors((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  }

  function addRow() {
    if (rows.length >= MAX_ROWS) return;
    focusNewRow.current = true;
    setRows((current) => [...current, newRow()]);
  }

  function removeRow(id) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current));
    setRowErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function changeRole(value) {
    setRole(value);
    setRowErrors({});
  }

  function finish(result) {
    setSummary(result);
    setPhase('done');
    onFinished?.(result);
    // Closed while it ran: say how it went here instead
    if (!openRef.current) {
      const registered = result.counts?.registered || 0;
      notify(`${plural(registered, 'account')} registered.`, {
        variant: result.status === 'failed' ? 'error' : 'success',
        title: 'Registration finished',
      });
    }
  }

  function pollBatch(batchId) {
    pollRef.current = setTimeout(async () => {
      try {
        const result = await apiAuth(`/api/auth/bulk-register/${encodeURIComponent(batchId)}`);
        if (result.status === 'complete' || result.status === 'failed') finish(result);
        else pollBatch(batchId);
      } catch {
        setPhase('form');
        setError('Could not check how the registration went. The accounts may have been created, so look for them in the list before trying again.');
        onFinished?.(null);
      }
    }, POLL_MS);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (startedRows.length === 0) {
      setError('Fill in at least one person.');
      return;
    }
    if (isDean && !programId) {
      setError('Pick the program to register them into.');
      return;
    }
    const errors = checkRows(startedRows, role);
    setRowErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError(`Fix the ${plural(Object.keys(errors).length, 'row')} marked below.`);
      return;
    }

    const field = idField(role);
    setWorkingCount(startedRows.length);
    setPhase('working');
    try {
      const result = await apiAuth('/api/auth/bulk-register', {
        method: 'POST',
        body: {
          role,
          programId: isDean ? programId : undefined,
          entries: startedRows.map((row) => ({
            name: row.name.trim(),
            email: row.email.trim(),
            [field]: row[field].trim(),
          })),
        },
      });

      // Sent: the rows are no longer a draft
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing to clean up without storage
      }
      setRows([newRow()]);

      const batchSummary = result.summary || result;
      if (batchSummary.status === 'complete' || batchSummary.status === 'failed' || !result.batchId) {
        finish(batchSummary);
      } else {
        pollBatch(result.batchId);
      }
    } catch (err) {
      setPhase('form');
      // The server names the rows it refused by their place among the rows sent
      const serverErrors = Array.isArray(err.data?.errors) ? err.data.errors : [];
      if (serverErrors.length > 0) {
        const byRow = {};
        serverErrors.forEach(({ index, message }) => {
          const row = startedRows[index];
          if (row) byRow[row.id] = [...(byRow[row.id] || []), { field: fieldOfMessage(message), message }];
        });
        setRowErrors(byRow);
        setError(`Fix the ${plural(Object.keys(byRow).length, 'row')} marked below.`);
      } else {
        setError(err.message || 'The accounts could not be registered.');
      }
    }
  }

  function startAnother() {
    setSummary(null);
    setError('');
    setRowErrors({});
    setPhase('form');
  }

  function handleClose() {
    if (phase === 'done') startAnother();
    onClose();
  }

  const counts = summary?.counts || {};
  const hasIssues = summary
    ? summary.status === 'failed' || (counts.emailFailures || 0) > 0 || (counts.insertFailures || 0) > 0
    : false;
  const title = phase === 'working'
    ? 'Registering Accounts'
    : phase === 'done'
      ? (hasIssues ? 'Registration Finished with Issues' : 'Registration Complete')
      : 'Register Accounts';

  return (
    <Modal open={open} onClose={handleClose} title={title} bodyClassName="br-modal-body">
      {phase === 'working' && (
        <div className="br-working" role="status">
          <span className="br-spinner" aria-hidden="true" />
          <p className="br-working-title">Registering {plural(workingCount, 'account')}...</p>
          <p className="qf-section-hint">
            You can close this window. The list updates when the registering finishes.
          </p>
        </div>
      )}

      {phase === 'done' && summary && (
        <div className="br-result">
          <section className="qf-section">
            <div className="qf-section-header">
              <h3 className="qf-section-title">Summary</h3>
            </div>
            <div className="ca-stats br-result-stats">
              <div className="ca-stat">
                <span className="ca-stat-label">Registered</span>
                <strong className="ca-stat-value">{counts.registered || 0}</strong>
                <span className="ca-stat-sub">sent their sign-in details</span>
              </div>
              <div className="ca-stat">
                <span className="ca-stat-label">Skipped</span>
                <strong className="ca-stat-value">{counts.skippedDuplicates || 0}</strong>
                <span className="ca-stat-sub">already registered or repeated</span>
              </div>
              <div className="ca-stat">
                <span className="ca-stat-label">Email not sent</span>
                <strong className={`ca-stat-value${counts.emailFailures ? ' br-stat-value--bad' : ''}`}>{counts.emailFailures || 0}</strong>
                <span className="ca-stat-sub">account made, email failed</span>
              </div>
              <div className="ca-stat">
                <span className="ca-stat-label">Not created</span>
                <strong className={`ca-stat-value${counts.insertFailures ? ' br-stat-value--bad' : ''}`}>{counts.insertFailures || 0}</strong>
                <span className="ca-stat-sub">could not be saved</span>
              </div>
            </div>
            {summary.status === 'failed' && (
              <p className="qf-section-hint br-result-note">
                The registering stopped before it finished. Check the list for the accounts that were made.
              </p>
            )}
          </section>

          <ResultList title="Email Not Sent" items={summary.emailFailures || []} describe={(item) => item.error || 'The email failed'} />
          <ResultList title="Not Created" items={summary.insertFailures || []} describe={(item) => item.reason || 'Could not be saved'} />
          <ResultList title="Skipped" items={summary.skippedDuplicates || []} describe={(item) => item.reason || 'Already registered'} />
          <ResultList title="Registered" items={summary.registered || []} describe={(item) => item.email} />

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={startAnother}>Register Another Batch</button>
            <button type="button" className="modal-btn-primary" onClick={handleClose}>Done</button>
          </div>
        </div>
      )}

      {phase === 'form' && (
        <form className="br-form" onSubmit={handleSubmit} noValidate>
          <div className="qp-modal-copy">
            <p className="qp-modal-subtitle">
              Each new account is emailed its sign-in details. Rows left empty are skipped.
            </p>
            {!isDean && user?.program?.name && <span className="qp-modal-program-chip">{user.program.name}</span>}
          </div>

          <section className="qf-section">
            <div className="qf-section-header">
              <h3 className="qf-section-title">Account Type</h3>
            </div>
            <div className="qf-section-body">
              <CapsuleFilters
                ariaLabel="Register students or alumni"
                options={ROLE_OPTIONS}
                value={role}
                onChange={changeRole}
              />
            </div>
          </section>

          {isDean && (
            <section className="qf-section">
              <div className="qf-section-header">
                <h3 className="qf-section-title qf-label-row">
                  Program * <FieldCheck valid={Boolean(programId)} />
                </h3>
              </div>
              <div className="qf-section-body">
                <p className="qf-section-hint">Everyone in this batch joins the same program.</p>
                <DropdownSelect
                  className="br-program-select"
                  value={programId}
                  onChange={(event) => setProgramId(event.target.value)}
                  ariaLabel="Program"
                  placeholder="Select a program"
                  options={programs.map((item) => ({
                    value: item._id,
                    label: `${item.name}${item.code ? ` (${item.code})` : ''}`,
                  }))}
                />
              </div>
            </section>
          )}

          <section className="qf-section">
            <div className="qf-section-header">
              <h3 className="qf-section-title qf-label-row">
                {role === 'alumni' ? 'Alumni' : 'Students'} ({startedRows.length}) *
                <FieldCheck valid={startedRows.length > 0 && Object.keys(checkRows(startedRows, role)).length === 0} />
              </h3>
              <button
                type="button"
                className="qf-secondary-btn qf-section-action"
                onClick={addRow}
                disabled={rows.length >= MAX_ROWS}
              >
                + Add Row
              </button>
            </div>
            <div className="qf-section-body">
              <p className="qf-section-hint">
                Full name, email, and {idLabel(role)} (YYYY-XXXXXX) for each person, up to {MAX_ROWS} at a time.
              </p>
              <div className="br-rows">
                {/* Each input is labelled on its own, so the column names are only for the eye */}
                <div className="br-row br-row--head" aria-hidden="true">
                  <span>Full Name</span>
                  <span>Email</span>
                  <span>{idLabel(role)}</span>
                </div>
                {rows.map((row, index) => {
                  const problems = rowErrors[row.id];
                  const errorId = `br-row-error-${row.id}`;
                  const field = idField(role);
                  // Only the fields at fault are marked; a problem the server didn't place marks them all
                  const inputProps = (key) => {
                    const invalid = Boolean(problems?.some((problem) => problem.field === key || problem.field === null));
                    return {
                      'aria-invalid': invalid || undefined,
                      'aria-describedby': invalid ? errorId : undefined,
                    };
                  };
                  return (
                    <div key={row.id} className={`br-row${problems ? ' has-error' : ''}`}>
                      <span>
                        <input
                          ref={index === rows.length - 1 ? lastRowRef : undefined}
                          type="text"
                          className="qf-answer-input"
                          placeholder="e.g. Juan Dela Cruz"
                          aria-label={`Full name, row ${index + 1}`}
                          value={row.name}
                          onChange={(event) => updateRow(row.id, 'name', event.target.value)}
                          {...inputProps('name')}
                        />
                      </span>
                      <span>
                        <input
                          type="email"
                          className="qf-answer-input"
                          placeholder="e.g. juan@students.nu-laguna.edu.ph"
                          aria-label={`Email, row ${index + 1}`}
                          value={row.email}
                          onChange={(event) => updateRow(row.id, 'email', event.target.value)}
                          {...inputProps('email')}
                        />
                      </span>
                      <span>
                        <input
                          type="text"
                          className="qf-answer-input"
                          placeholder="YYYY-XXXXXX"
                          aria-label={`${idLabel(role)}, row ${index + 1}`}
                          value={row[field]}
                          onChange={(event) => updateRow(row.id, field, event.target.value)}
                          {...inputProps('id')}
                        />
                      </span>
                      <span className="br-row-remove">
                        <TrashButton
                          label={`Remove row ${index + 1}`}
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length === 1}
                        />
                      </span>
                      {problems && (
                        <p id={errorId} className="qf-inline-note qf-inline-note--error br-row-error">
                          {problems.map((problem) => problem.message).join(' ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {error && <p className="error-text" role="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={handleClose}>Cancel</button>
            <button type="submit" className="modal-btn-primary" disabled={isDean && programs.length === 0}>
              {startedRows.length > 0 ? `Register ${plural(startedRows.length, 'Account')}` : 'Register'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
