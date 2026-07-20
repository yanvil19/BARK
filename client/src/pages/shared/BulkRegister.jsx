import { useEffect, useState, useRef } from 'react';
import { apiAuth } from '../../lib/api';
import { Modal } from '../../components/Modal';
import SearchBar from '../../components/SearchBar';
import DropdownSelect from '../../components/DropdownSelect';
import Pagination from '../../components/Pagination';
import PageHeader from '../../components/PageHeader';
import '../../styles/shared/BulkRegister.css';

const BULK_REGISTRATION_DRAFT_KEY = 'draft_bulk_registration';
const EMPTY_ENTRY = { name: '', email: '', studentId: '', alumniId: '' };

export default function BulkRegister({ user }) {
  const [role, setRole] = useState('student');

  // Department/Program Selection
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');

  // Row entries
  const [entries, setEntries] = useState([EMPTY_ENTRY]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Result state
  const [batchResult, setBatchResult] = useState(null); // null | { status, counts, registered, skippedDuplicates, emailFailures, insertFailures }
  const [showResultModal, setShowResultModal] = useState(false);

  // View toggle state
  const [activeView, setActiveView] = useState('form'); // 'form' or 'list'
  const [registeredAccounts, setRegisteredAccounts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState(''); // 'student', 'alumni', or ''
  const [listFilterProgram, setListFilterProgram] = useState(''); // For dean to filter by program in list view
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);

  const pollRef = useRef(null);
  const hasLoadedDraftRef = useRef(false);

  // TODO: temporary demo pattern - for production, consider autosaving drafts to the backend instead of localStorage, since this content is confidential and shouldn't persist client-side long-term
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BULK_REGISTRATION_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.role) setRole(draft.role);
      if (draft.departmentId) setDepartmentId(draft.departmentId);
      if (draft.programId) setProgramId(draft.programId);
      if (Array.isArray(draft.entries) && draft.entries.length > 0) setEntries(draft.entries);
    } catch (err) {
      console.warn('Failed to restore bulk registration draft:', err);
    } finally {
      hasLoadedDraftRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedDraftRef.current) return;
    const id = setTimeout(() => {
      try {
        const hasDraft =
          role !== 'student' ||
          Boolean(departmentId) ||
          Boolean(programId) ||
          entries.some((entry) => entry.name || entry.email || entry.studentId || entry.alumniId);

        if (!hasDraft) {
          window.localStorage.removeItem(BULK_REGISTRATION_DRAFT_KEY);
          return;
        }

        window.localStorage.setItem(BULK_REGISTRATION_DRAFT_KEY, JSON.stringify({
          role,
          departmentId,
          programId,
          entries,
        }));
      } catch (err) {
        console.warn('Failed to save bulk registration draft:', err);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [departmentId, entries, programId, role]);

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

  // Fetch programs for dean's department on mount (for list view filter)
  useEffect(() => {
    if (user.role === 'dean' && user.department) {
      const deptId = typeof user.department === 'object' ? user.department._id : user.department;
      apiAuth(`/api/catalog/programs?departmentId=${encodeURIComponent(deptId)}`)
        .then((data) => setPrograms(data.programs || []))
        .catch((err) => console.error('Failed to fetch programs for list view', err));
    }
  }, [user.role, user.department]);

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
          setShowResultModal(true);
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
        window.localStorage.removeItem(BULK_REGISTRATION_DRAFT_KEY);
        setEntries([EMPTY_ENTRY]);
        setDepartmentId('');
        setProgramId('');
        setRole('student');
        // Start polling for the final summary
        pollUntilDone(res.batchId);
      } else {
        window.localStorage.removeItem(BULK_REGISTRATION_DRAFT_KEY);
        setEntries([EMPTY_ENTRY]);
        setDepartmentId('');
        setProgramId('');
        setRole('student');
        // Completed instantly (e.g., all duplicates)
        setBatchResult(res.summary || res);
        setShowResultModal(true);
        setIsSubmitting(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to submit bulk registration.');
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setEntries([EMPTY_ENTRY]);
    setBatchResult(null);
    setShowResultModal(false);
    setError(null);
  };

  // Handle switching to list view and load registered accounts
  const handleViewChange = (view) => {
    setActiveView(view);
    setCurrentPage(1);
    if (view === 'list') {
      // Fetch programs for dean to filter in list view
      if (user.role === 'dean' && user.department) {
        const deptId = typeof user.department === 'object' ? user.department._id : user.department;
        apiAuth(`/api/catalog/programs?departmentId=${encodeURIComponent(deptId)}`)
          .then((data) => {
            setPrograms(data.programs || []);
          })
          .catch((err) => {
            console.error('Failed to fetch programs for list view', err);
            setPrograms([]);
          });
      }
      
      // Fetch all registered students/alumni based on user role
      const params = new URLSearchParams({ role: 'student,alumni', page: '1', limit: String(pageSize) });
      if (user.role === 'dean' && user.department) {
        const deptId = typeof user.department === 'object' ? user.department._id : user.department;
        params.append('department', deptId);
        if (listFilterProgram) {
          params.append('program', listFilterProgram);
        }
      } else if (user.role === 'program_chair' && user.program) {
        const progId = typeof user.program === 'object' ? user.program._id : user.program;
        params.append('program', progId);
      }
      apiAuth(`/api/auth/users?${params}`)
        .then((data) => {
          setRegisteredAccounts(data.users || []);
          setTotalItems(data.total || 0);
        })
        .catch((err) => console.error('Failed to fetch registered accounts', err));
    }
  };

  // Handle search query change (for list view)
  const handleSearchChange = (value) => {
    setSearchQuery(value);
    setCurrentPage(1);
    const params = new URLSearchParams({ role: 'student,alumni', page: '1', limit: String(pageSize) });
    if (user.role === 'dean' && user.department) {
      const deptId = typeof user.department === 'object' ? user.department._id : user.department;
      params.append('department', deptId);
      if (listFilterProgram) {
        params.append('program', listFilterProgram);
      }
    } else if (user.role === 'program_chair' && user.program) {
      const progId = typeof user.program === 'object' ? user.program._id : user.program;
      params.append('program', progId);
    }
    if (value) {
      params.append('search', value);
    }
    apiAuth(`/api/auth/users?${params}`)
      .then((data) => {
        setRegisteredAccounts(data.users || []);
        setTotalItems(data.total || 0);
      })
      .catch((err) => console.error('Failed to fetch registered accounts', err));
  };

  // Handle list view program filter change (for deans)
  const handleListFilterProgramChange = (programId) => {
    setListFilterProgram(programId);
    setCurrentPage(1);
    const params = new URLSearchParams({ role: 'student,alumni', page: '1', limit: String(pageSize) });
    if (user.role === 'dean' && user.department) {
      const deptId = typeof user.department === 'object' ? user.department._id : user.department;
      params.append('department', deptId);
      if (programId) {
        params.append('program', programId);
      }
    }
    if (searchQuery) {
      params.append('search', searchQuery);
    }
    apiAuth(`/api/auth/users?${params}`)
      .then((data) => {
        setRegisteredAccounts(data.users || []);
        setTotalItems(data.total || 0);
      })
      .catch((err) => console.error('Failed to fetch registered accounts', err));
  };

  // Handle pagination page changes
  const handlePageChange = (page) => {
    setCurrentPage(page);
    const params = new URLSearchParams({ role: 'student,alumni', page: String(page), limit: String(pageSize) });
    if (user.role === 'dean' && user.department) {
      const deptId = typeof user.department === 'object' ? user.department._id : user.department;
      params.append('department', deptId);
      if (listFilterProgram) {
        params.append('program', listFilterProgram);
      }
    } else if (user.role === 'program_chair' && user.program) {
      const progId = typeof user.program === 'object' ? user.program._id : user.program;
      params.append('program', progId);
    }
    if (searchQuery) {
      params.append('search', searchQuery);
    }
    apiAuth(`/api/auth/users?${params}`)
      .then((data) => {
        setRegisteredAccounts(data.users || []);
        setTotalItems(data.total || 0);
      })
      .catch((err) => console.error('Failed to fetch registered accounts', err));
  };

  // Filter registered accounts based on search and type filter
  const filteredAccounts = registeredAccounts.filter((account) => {
    const matchesType = !filterType || account.role === filterType;
    return matchesType;
  });

  // ── Result screen (modal) ──────────────────────────────────────────────────────────
  if (isSubmitting) {
    return (
      <div className="bulk-register-progress">
        <div className="br-spinner" />
        <p className="status processing">Processing registrations… Please wait.</p>
      </div>
    );
  }

  // Prepare result data for modal
  const resultContent = batchResult ? (() => {
    const counts = batchResult.counts || {};
    const details = {
      registered: batchResult.registered || [],
      skippedDuplicates: batchResult.skippedDuplicates || [],
      emailFailures: batchResult.emailFailures || [],
      insertFailures: batchResult.insertFailures || [],
    };
    const allOk = counts.registered > 0 && counts.emailFailures === 0 && counts.insertFailures === 0;

    return {
      counts,
      details,
      allOk,
    };
  })() : null;

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="bulk-register-container">
      {/* View Toggle Header */}
      <div className="br-view-header">
        <div className="br-view-toggle">
          <button
            className={`br-toggle-btn ${activeView === 'form' ? 'active' : ''}`}
            onClick={() => handleViewChange('form')}
          >
            Registration Form
          </button>
          <button
            className={`br-toggle-btn ${activeView === 'list' ? 'active' : ''}`}
            onClick={() => handleViewChange('list')}
          >
            Registered Accounts
          </button>
        </div>
      </div>

      {error && <div className="error-alert">{error}</div>}

      {/* Form View */}
      {activeView === 'form' && (
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
      )}

      {/* List View */}
      {activeView === 'list' && (
      <div className="br-list-view">
        <div className="br-list-header">
          <SearchBar
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search by name, email, or ID..."
            className="br-search"
          />
          {user.role === 'dean' && (
            <DropdownSelect
              value={listFilterProgram}
              onChange={(e) => handleListFilterProgramChange(e.target.value)}
              placeholder="All Programs"
              options={programs.map((p) => ({ value: p._id, label: `${p.code} - ${p.name}` }))}
              className="br-filter"
            />
          )}
          <DropdownSelect
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            placeholder="All Types"
            options={[
              { value: 'student', label: 'Students' },
              { value: 'alumni', label: 'Alumni' },
            ]}
            className="br-filter"
          />
        </div>

        <div className="br-table-wrapper">
          <table className="br-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>School ID</th>
                <th>Department</th>
                <th>Program</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length > 0 ? (
                filteredAccounts.map((account) => (
                  <tr key={account._id}>
                    <td>{account.name}</td>
                    <td>{account.email}</td>
                    <td>{account.studentId || account.alumniId || '—'}</td>
                    <td>{account.department?.name || '—'}</td>
                    <td>{account.program?.name || '—'}</td>
                    <td>
                      <span className={`br-type-badge br-type-${account.role}`}>
                        {account.role === 'student' ? 'Student' : 'Alumni'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="br-table-empty">
                    No registered accounts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="br-list-footer">
          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            itemLabel="accounts"
            classPrefix="br"
          />
        </div>
      </div>
      )}

      {/* Result Modal */}
      <Modal
        open={showResultModal}
        onClose={resetForm}
        title={resultContent?.allOk ? 'Registration Complete' : 'Registration Finished with Issues'}
        size="large"
        bodyClassName="br-modal-body"
      >
        <div className="br-modal-content">
          <div className="br-modal-header">
            <div className={`br-result-icon ${resultContent?.allOk ? 'success' : 'partial'}`}>
              {resultContent?.allOk ? '✓' : '!'}
            </div>
          </div>

          {resultContent && (
            <>
              <div className="summary-stats">
                <div className="stat-card success">
                  <span className="stat-num">{resultContent.counts.registered ?? 0}</span>
                  <span className="stat-label">Registered</span>
                </div>
                {(resultContent.counts.skippedDuplicates ?? 0) > 0 && (
                  <div className="stat-card warning">
                    <span className="stat-num">{resultContent.counts.skippedDuplicates}</span>
                    <span className="stat-label">Skipped (Duplicates)</span>
                  </div>
                )}
                {(resultContent.counts.emailFailures ?? 0) > 0 && (
                  <div className="stat-card error">
                    <span className="stat-num">{resultContent.counts.emailFailures}</span>
                    <span className="stat-label">Email Failures</span>
                  </div>
                )}
                {(resultContent.counts.insertFailures ?? 0) > 0 && (
                  <div className="stat-card error">
                    <span className="stat-num">{resultContent.counts.insertFailures}</span>
                    <span className="stat-label">Insert Failures</span>
                  </div>
                )}
              </div>

              {/* Successfully Registered */}
              {resultContent.details.registered.length > 0 && (
                <details className="br-details" open>
                  <summary>Successfully Registered ({resultContent.details.registered.length})</summary>
                  <ul>
                    {resultContent.details.registered.map((d, i) => (
                      <li key={i}>
                        <strong>{d.name}</strong> ({d.email})
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Skipped Duplicates */}
              {resultContent.details.skippedDuplicates.length > 0 && (
                <details className="br-details">
                  <summary>Skipped Duplicates ({resultContent.details.skippedDuplicates.length})</summary>
                  <ul>
                    {resultContent.details.skippedDuplicates.map((d, i) => (
                      <li key={i}>{d.email} — {d.reason}</li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Email Failures */}
              {resultContent.details.emailFailures.length > 0 && (
                <details className="br-details">
                  <summary>Email Failures ({resultContent.details.emailFailures.length})</summary>
                  <ul>
                    {resultContent.details.emailFailures.map((d, i) => (
                      <li key={i}>{d.email} — {d.error}</li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Insert Failures */}
              {resultContent.details.insertFailures.length > 0 && (
                <details className="br-details">
                  <summary>Insert Failures ({resultContent.details.insertFailures.length})</summary>
                  <ul>
                    {resultContent.details.insertFailures.map((d, i) => (
                      <li key={i}>{d.email} — {d.reason}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="br-modal-actions">
                <button className="br-btn br-btn-primary" onClick={resetForm}>
                  Register Another Batch
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
