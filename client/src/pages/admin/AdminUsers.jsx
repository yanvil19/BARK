import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/AdminUsers.css';
import { Modal } from '../../components/Modal.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { useToast } from '../../components/Toast.jsx';

function PasswordToggle({ shown, onToggle, label, disabled }) {
  function handleKeyDown(e) {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  }

  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      className={`um-password-toggle${disabled ? ' is-disabled' : ''}`}
      aria-label={label}
      title={label}
      onClick={disabled ? undefined : onToggle}
      onKeyDown={handleKeyDown}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="um-password-toggle-icon">
        <path
          d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        {!shown ? (
          <path
            d="M4 4 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        ) : null}
      </svg>
    </span>
  );
}


export default function AdminUsers({ me }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [emailToggleBusyById, setEmailToggleBusyById] = useState({});
  const [emailToggleMsgById, setEmailToggleMsgById] = useState({});
  const [bulkEmailBusy, setBulkEmailBusy] = useState(false);
  const [bulkEmailMsg, setBulkEmailMsg] = useState(null);

  // Modal states
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | 'deactivate' | 'activate' | 'delete'
  const [selectedUser, setSelectedUser] = useState(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [hoveredDeleteUserId, setHoveredDeleteUserId] = useState(null);

  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [editForm, setEditForm] = useState({
    name: '', email: '', role: '', password: '', departmentId: '', programId: '', studentId: '', alumniId: '',
  });

  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '', email: '', role: 'professor', password: '', departmentId: '', programId: '', studentId: '', alumniId: '',
  });

  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const users = useMemo(() => (data && data.users ? data.users : []), [data]);

  const { paginatedUsers, totalPages } = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      paginatedUsers: users.slice(startIndex, endIndex),
      totalPages: Math.ceil(users.length / itemsPerPage),
    };
  }, [users, currentPage]);

  const allEmailTargets = useMemo(
    () => (users || []).filter((u) => u?._id && u._id !== me?._id),
    [users, me?._id]
  );

  const emailsTotalCount = allEmailTargets.length;
  const emailsEnabledCount = useMemo(
    () => allEmailTargets.filter((u) => u.receiveEmails !== false).length,
    [allEmailTargets]
  );

  const allEmailsEnabled = useMemo(() => {
    if (!allEmailTargets.length) return false;
    return allEmailTargets.every((u) => u.receiveEmails !== false);
  }, [allEmailTargets]);

  async function fetchUsersList(search, role, dept) {
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: 100 });
      if (search) params.append('search', search);
      if (role) params.append('role', role);
      if (dept) params.append('department', dept);

      const res = await apiAuth(`/api/auth/users?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    await fetchUsersList(searchQuery, filterRole, filterDepartment);
  }

  async function toggleReceiveEmails(user, nextValue) {
    if (!user?._id) return;
    if (user._id === me?._id) return;

    setEmailToggleBusyById((m) => ({ ...m, [user._id]: true }));
    setEmailToggleMsgById((m) => ({ ...m, [user._id]: null }));

    try {
      await apiAuth(`/api/auth/users/${encodeURIComponent(user._id)}/email-toggle`, {
        method: 'PATCH',
        body: { receiveEmails: Boolean(nextValue) },
      });

      setData((prev) => {
        if (!prev?.users) return prev;
        return {
          ...prev,
          users: prev.users.map((u) => (u._id === user._id ? { ...u, receiveEmails: Boolean(nextValue) } : u)),
        };
      });

      setEmailToggleMsgById((m) => ({ ...m, [user._id]: { type: 'success', text: 'Saved' } }));
      setTimeout(() => {
        setEmailToggleMsgById((m) => (m[user._id] ? { ...m, [user._id]: null } : m));
      }, 1500);
    } catch (err) {
      setEmailToggleMsgById((m) => ({ ...m, [user._id]: { type: 'error', text: err.message || 'Failed' } }));
      setTimeout(() => {
        setEmailToggleMsgById((m) => (m[user._id] ? { ...m, [user._id]: null } : m));
      }, 2500);
    } finally {
      setEmailToggleBusyById((m) => ({ ...m, [user._id]: false }));
    }
  }

  async function bulkSetReceiveEmails(nextValue) {
    if (bulkEmailBusy) return;

    const targets = allEmailTargets;
    if (targets.length === 0) {
      setBulkEmailMsg({ type: 'error', text: 'No users to update' });
      setTimeout(() => setBulkEmailMsg(null), 2000);
      return;
    }

    setBulkEmailBusy(true);
    setBulkEmailMsg(null);
    setEmailToggleMsgById((m) => {
      const next = { ...m };
      for (const u of targets) next[u._id] = null;
      return next;
    });
    setEmailToggleBusyById((m) => {
      const next = { ...m };
      for (const u of targets) next[u._id] = true;
      return next;
    });

    try {
      const results = await Promise.allSettled(
        targets.map((u) => apiAuth(`/api/auth/users/${encodeURIComponent(u._id)}/email-toggle`, {
          method: 'PATCH',
          body: { receiveEmails: Boolean(nextValue) },
        }))
      );

      const failed = results.filter((r) => r.status === 'rejected');

      setData((prev) => {
        if (!prev?.users) return prev;
        const targetIds = new Set(targets.map((u) => u._id));
        return {
          ...prev,
          users: prev.users.map((u) => (targetIds.has(u._id) ? { ...u, receiveEmails: Boolean(nextValue) } : u)),
        };
      });

      setBulkEmailMsg(
        failed.length
          ? { type: 'error', text: `Updated with ${failed.length} error(s)` }
          : { type: 'success', text: 'Updated' }
      );
      setTimeout(() => setBulkEmailMsg(null), failed.length ? 2500 : 1500);
    } finally {
      setEmailToggleBusyById((m) => {
        const next = { ...m };
        for (const u of targets) next[u._id] = false;
        return next;
      });
      setBulkEmailBusy(false);
    }
  }

  async function loadCatalog() {
    try {
      const [deptRes, progRes] = await Promise.all([
        apiAuth('/api/admin/catalog/departments?limit=200'),
        apiAuth('/api/admin/catalog/programs?limit=200'),
      ]);
      setDepartments(deptRes.departments || []);
      setPrograms(progRes.programs || []);
    } catch (err) {
      // Catalog is helpful but not required for basic user ops
    }
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setCurrentPage(1);
      fetchUsersList(searchQuery, filterRole, filterDepartment);
    }, 100);
    return () => clearTimeout(t);
  }, [searchQuery, filterRole, filterDepartment]);

  function closeModal() {
    setCurrentPage(1);
    setModalMode(null);
    setSelectedUser(null);
    setCreateError('');
    setEditError('');
    setDeleteError('');
    setCreateForm({ name: '', email: '', role: 'professor', password: '', departmentId: '', programId: '', studentId: '', alumniId: '' });
    setEditForm({ name: '', email: '', role: '', password: '', departmentId: '', programId: '', studentId: '', alumniId: '' });
  }

  function startCreate() {
    setModalMode('create');
  }

  function startEdit(user) {
    setSelectedUser(user);
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      role: user.role || '',
      password: '',
      departmentId: user.department?._id || user.department || '',
      programId: user.program?._id || user.program || '',
      studentId: user.studentId || '',
      alumniId: user.alumniId || '',
    });
    setModalMode('edit');
  }

  function startDeactivate(user) {
    setSelectedUser(user);
    setModalMode('deactivate');
  }

  async function confirmDeactivate() {
    if (!selectedUser) return;
    try {
      await apiAuth(`/api/auth/users/${encodeURIComponent(selectedUser._id)}/deactivate`, { method: 'PATCH', body: {} });
      await load();
      closeModal();
    } catch (err) {
      notify(err.message || 'Deactivate failed', { variant: 'error', title: 'Deactivate' });
    }
  }

  function startActivate(user) {
    setSelectedUser(user);
    setModalMode('activate');
  }

  function startDelete(user) {
    setSelectedUser(user);
    setDeleteError('');
    setModalMode('delete');
  }

  async function confirmActivate() {
    if (!selectedUser) return;
    try {
      await apiAuth(`/api/auth/users/${encodeURIComponent(selectedUser._id)}/activate`, { method: 'PATCH', body: {} });
      await load();
      closeModal();
    } catch (err) {
      notify(err.message || 'Activate failed', { variant: 'error', title: 'Activate' });
    }
  }

  async function confirmDelete() {
    if (!selectedUser) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await apiAuth(`/api/auth/users/${encodeURIComponent(selectedUser._id)}`, { method: 'DELETE' });
      await load();
      closeModal();
    } catch (err) {
      setDeleteError(err.message || 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (!selectedUser) return;
    setEditBusy(true);
    setEditError('');
    try {
      const isSelf = selectedUser._id === me?._id;
      const body = {
        name: editForm.name,
        role: editForm.role,
        departmentId: editForm.departmentId || null,
        programId: editForm.programId || null,
      };
      if (editForm.role === 'student' && editForm.studentId) body.studentId = editForm.studentId;
      if (editForm.role === 'alumni' && editForm.alumniId) body.alumniId = editForm.alumniId;
      if (isSelf) {
        body.email = editForm.email;
        if (editForm.password) body.password = editForm.password;
      }

      await apiAuth(`/api/auth/users/${encodeURIComponent(selectedUser._id)}`, { method: 'PATCH', body });
      await load();
      closeModal();
    } catch (err) {
      setEditError(err.message || 'Update failed');
    } finally {
      setEditBusy(false);
    }
  }

  const departmentPrograms = useMemo(() => {
    if (!editForm.departmentId) return programs;
    return programs.filter((p) => String(p.department?._id || p.department) === String(editForm.departmentId));
  }, [programs, editForm.departmentId]);

  const createDepartmentPrograms = useMemo(() => {
    if (!createForm.departmentId) return programs;
    return programs.filter((p) => String(p.department?._id || p.department) === String(createForm.departmentId));
  }, [programs, createForm.departmentId]);

  async function submitCreate(e) {
    e.preventDefault();
    setCreateBusy(true);
    setCreateError('');
    try {
      const body = {
        name: createForm.name,
        email: createForm.email,
        password: createForm.password,
        role: createForm.role,
        departmentId: createForm.departmentId || null,
        programId: createForm.programId || null,
      };
      if (createForm.role === 'student' && createForm.studentId) body.studentId = createForm.studentId;
      if (createForm.role === 'alumni' && createForm.alumniId) body.alumniId = createForm.alumniId;

      await apiAuth('/api/auth/register', { method: 'POST', body });
      await load();
      closeModal();
    } catch (err) {
      setCreateError(err.message || 'Create failed');
    } finally {
      setCreateBusy(false);
    }
  }

  function formatRoleLabel(role) {
    const labels = {
      student: 'Student', alumni: 'Alumni', dean: 'Dean',
      professor: 'Professor', program_chair: 'Program Chair', super_admin: 'Super Admin',
    };
    return labels[role] || role;
  }

  function formatUserId(user) {
    if (user.role === 'alumni') return user.alumniId || '(none)';
    if (user.role === 'student') return user.studentId || '(none)';
    return '(n/a)';
  }

  function TrashIcon(props) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    );
  }

  return (
    <main className="um-page">
      {/* ── Page Header ── */}
      <header className="um-page-header">
        <div className="um-header">
          <div>
            <h1 className="um-title">User Management</h1>
            <p className="um-subtitle">Create, edit, and manage all system users</p>
          </div>
          <div className="um-header-actions">
            <button
              type="button"
              className={`um-btn-delete-mode ${deleteMode ? 'um-btn-delete-mode--active' : ''}`}
              onClick={() => setDeleteMode((value) => !value)}
            >
              {deleteMode ? 'Exit Delete Mode' : 'Delete Mode'}
            </button>
            <button className="um-btn-add" onClick={startCreate}>
              + Add User
            </button>
          </div>
        </div>
      </header>

      <div style={{ padding: '0 20px' }}>
        {/* ── Filters ── */}
        <div className="um-filters">
          <input
            className="um-search"
            type="text"
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="um-filter-select"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="">Filter: All Roles</option>
            <option value="student">Student</option>
            <option value="alumni">Alumni</option>
            <option value="super_admin">Super Admin</option>
            <option value="dean">Dean</option>
            <option value="program_chair">Program Chair</option>
            <option value="professor">Professor</option>
          </select>
          <select
            className="um-filter-select"
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
          >
            <option value="">Filter: All Departments</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>{d.code} - {d.name}</option>
            ))}
          </select>

          <button
            type="button"
            className={`um-email-switch ${allEmailsEnabled ? 'um-email-switch--on' : 'um-email-switch--off'}`}
            disabled={bulkEmailBusy || busy || allEmailTargets.length === 0}
            onClick={() => bulkSetReceiveEmails(!allEmailsEnabled)}
            title={allEmailsEnabled ? 'Disable email receiving for all users' : 'Enable email receiving for all users'}
            aria-pressed={allEmailsEnabled}
          >
            <span className="um-email-switch-label">Receive Emails</span>
            <span className="um-email-switch-track" aria-hidden="true">
              <span className="um-email-switch-text">{allEmailsEnabled ? 'ON' : 'OFF'}</span>
              <span className="um-email-switch-knob" />
            </span>
          </button>
        </div>

        {bulkEmailMsg ? (
          <p className="um-error" style={{ margin: '0 0 16px', color: bulkEmailMsg.type === 'success' ? '#2e7d32' : undefined }}>
            {bulkEmailMsg.text}
          </p>
        ) : null}

        {error ? <p className="um-error">{error}</p> : null}

        {/* ── User Table ── */}
        <div className="um-table-wrap">
          <div className="scroll-x">
            {busy ? <p className="um-loading">Loading users...</p> : (
              <table className="um-table um-table-userman">
                <colgroup>
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                </colgroup>
                <thead>
                  <tr><th>User</th><th>ID</th><th>Role</th><th>Department</th><th>Program</th><th>Status</th><th>Receive Emails ({emailsEnabledCount}/{emailsTotalCount} users)</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {paginatedUsers.length === 0 ? <tr><td colSpan={8} className="um-empty">No users found.</td></tr> : (
                    paginatedUsers.map((u) => (
                      <tr key={u._id} className={hoveredDeleteUserId === u._id ? 'um-row-delete-hover' : ''}>
                        <td>
                          <div className="um-user-name">{u.name}</div>
                          <div className="um-user-email">{u.email}</div>
                        </td>
                        <td>{formatUserId(u)}</td>
                        <td><span className={`um-badge um-badge--${u.role}`}>{formatRoleLabel(u.role)}</span></td>
                        <td>{u.department?.code ? <span className="um-badge um-badge--dept">{u.department.code}</span> : <span className="um-none">(none)</span>}</td>
                        <td>{u.program?.code ? <span className="um-badge um-badge--dept">{u.program.code}</span> : <span className="um-none">(none)</span>}</td>
                        <td><span className={`um-status ${u.isActive ? 'um-status--active' : 'um-status--inactive'}`}>● {u.isActive ? 'Active' : 'Inactive'}</span></td>
                        <td>
                          {u._id === me?._id ? <span className="um-none">(you)</span> : (
                            <div className="um-email-cell">
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: emailToggleBusyById[u._id] ? 'not-allowed' : 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={u.receiveEmails !== false}
                                  disabled={Boolean(emailToggleBusyById[u._id])}
                                  onChange={(e) => toggleReceiveEmails(u, e.target.checked)}
                                />
                                <span style={{ fontSize: 12, color: '#555' }}>{u.receiveEmails === false ? 'Disabled' : 'Enabled'}</span>
                              </label>
                              {emailToggleMsgById[u._id] ? (
                                <span style={{ fontSize: 12, color: emailToggleMsgById[u._id].type === 'success' ? '#2e7d32' : '#b00020' }}>
                                  {emailToggleMsgById[u._id].text}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="um-actions-cell">
                          <button className="um-btn-edit" onClick={() => startEdit(u)}>Edit</button>
                          {u.isActive ? <button className="um-btn-deactivate" onClick={() => startDeactivate(u)}>Deactivate</button>
                            : <button className="um-btn-activate" onClick={() => startActivate(u)}>Activate</button>}
                          {deleteMode ? (
                            <button
                              type="button"
                              className="um-btn-delete-icon"
                              onClick={() => startDelete(u)}
                              onMouseEnter={() => setHoveredDeleteUserId(u._id)}
                              onMouseLeave={() => setHoveredDeleteUserId((current) => (current === u._id ? null : current))}
                              aria-label={`Delete ${u.name || u.email}`}
                              title="Delete user"
                            >
                              <TrashIcon className="um-delete-icon" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>

      {error ? <p className="um-error">{error}</p> : null}

      {/* ── User Table ── */}
      {false && (<div className="um-table-wrap">
        {busy ? <p className="um-loading">Loading users...</p> : (
          <div className="scroll-x">
            <table className="um-table">
              <thead>
                <tr><th style={{ width: '200px' }}>User</th><th>ID</th><th>Role</th><th>Department</th><th>Program</th><th>Status</th><th>Receive Emails ({emailsEnabledCount}/{emailsTotalCount} users)</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {paginatedUsers.length === 0 ? <tr><td colSpan={8} className="um-empty">No users found.</td></tr> : (
                  paginatedUsers.map((u) => (
                    <tr key={u._id} className={hoveredDeleteUserId === u._id ? 'um-row-delete-hover' : ''}>
                      <td>
                        <div className="um-user-name">{u.name}</div>
                        <div className="um-user-email">{u.email}</div>
                      </td>
                      <td>{formatUserId(u)}</td>
                      <td><span className={`um-badge um-badge--${u.role}`}>{formatRoleLabel(u.role)}</span></td>
                      <td>{u.department?.code ? <span className="um-badge um-badge--dept">{u.department.code}</span> : <span className="um-none">(none)</span>}</td>
                      <td>{u.program?.code ? <span className="um-badge um-badge--dept">{u.program.code}</span> : <span className="um-none">(none)</span>}</td>
                      <td><span className={`um-status ${u.isActive ? 'um-status--active' : 'um-status--inactive'}`}>● {u.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        {u._id === me?._id ? <span className="um-none">(you)</span> : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: emailToggleBusyById[u._id] ? 'not-allowed' : 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={u.receiveEmails !== false}
                                disabled={Boolean(emailToggleBusyById[u._id])}
                                onChange={(e) => toggleReceiveEmails(u, e.target.checked)}
                              />
                              <span style={{ fontSize: 12, color: '#555' }}>{u.receiveEmails === false ? 'Disabled' : 'Enabled'}</span>
                            </label>
                            {emailToggleMsgById[u._id] ? (
                              <span style={{ fontSize: 12, color: emailToggleMsgById[u._id].type === 'success' ? '#2e7d32' : '#b00020' }}>
                                {emailToggleMsgById[u._id].text}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="um-actions-cell">
                        <button className="um-btn-edit" onClick={() => startEdit(u)}>Edit</button>
                        {u.isActive ? <button className="um-btn-deactivate" onClick={() => startDeactivate(u)}>Deactivate</button>
                          : <button className="um-btn-activate" onClick={() => startActivate(u)}>Activate</button>}
                        {deleteMode ? (
                          <button
                            type="button"
                            className="um-btn-delete-icon"
                            onClick={() => startDelete(u)}
                            onMouseEnter={() => setHoveredDeleteUserId(u._id)}
                            onMouseLeave={() => setHoveredDeleteUserId((current) => (current === u._id ? null : current))}
                            aria-label={`Delete ${u.name || u.email}`}
                            title="Delete user"
                          >
                            <TrashIcon className="um-delete-icon" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>)}

      {/* ── Pagination ── */}
      {!busy && users.length > 0 && (
        <div className="um-pagination">
          <div className="um-pagination-info">
            Showing {users.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, users.length)} of {users.length} users
          </div>
          <div className="um-pagination-controls">
            <button
              className="um-pagination-btn"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              ← Previous
            </button>
            <div className="um-pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  className={`um-pagination-page ${currentPage === page ? 'um-pagination-page--active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              className="um-pagination-btn"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal open={modalMode === 'create'} onClose={closeModal} title="Creating User">
        <form onSubmit={submitCreate} className="um-register-form">
          <div className="um-form-grid">
            <div className="um-form-group">
              <label>Full Name</label>
              <input value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="ex. Juan Dela Cruz" required />
            </div>
            <div className="um-form-group">
              <label>Email Address</label>
              <input type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} placeholder="ex. juandelacruz@gmail.com" required />
            </div>
            <div className="um-form-group">
              <label>Password</label>
              <div className="um-password-input-wrapper">
                <input type={showCreatePassword ? 'text' : 'password'} value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} placeholder="Enter password" required />
                <PasswordToggle shown={showCreatePassword} onToggle={() => setShowCreatePassword(!showCreatePassword)} label={showCreatePassword ? 'Hide password' : 'Show password'} />
              </div>
            </div>
            <div className="um-form-group">
              <label>Department</label>
              <select value={createForm.departmentId} onChange={(e) => setCreateForm((f) => ({ ...f, departmentId: e.target.value, programId: '' }))}>
                <option value="">(none)</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>
            <div className="um-form-group">
              <label>Program</label>
              <select 
                value={createForm.programId} 
                onChange={(e) => setCreateForm((f) => ({ ...f, programId: e.target.value }))}
                disabled={!createForm.departmentId}
              >
                <option value="">{createForm.departmentId ? '(none)' : 'Select Department first'}</option>
                {createDepartmentPrograms.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>

            <div className="um-form-group full-width">
              <span className="um-segment-label">User Role</span>
              <div className="um-segmented">
                {[
                  { value: 'professor', label: 'Professor' },
                  { value: 'program_chair', label: 'Program Chair' },
                  { value: 'dean', label: 'Dean' },
                  { value: 'super_admin', label: 'Super Admin' },
                ].map((roleObj) => (
                  <button
                    key={roleObj.value}
                    type="button"
                    className={createForm.role === roleObj.value ? 'is-active' : ''}
                    onClick={() => setCreateForm((f) => ({ ...f, role: roleObj.value }))}
                  >
                    {roleObj.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {createError ? <p className="um-error">{createError}</p> : null}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={closeModal}>Cancel</button>
            <button type="submit" className="modal-btn-primary" disabled={createBusy}>{createBusy ? 'Creating...' : 'Create User'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={modalMode === 'edit'} onClose={closeModal} title={`Editing User   ${selectedUser?.email ? `(${selectedUser.email})` : ''}`}>
        <form onSubmit={submitEdit} className="um-register-form">
          <div className="um-form-grid">
            <div className="um-form-group">
              <label>Full Name</label>
              <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>

            {selectedUser?._id === me?._id && (
              <>
                <div className="um-form-group">
                  <label>Email Address</label>
                  <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} required />
                </div>
                <div className="um-form-group">
                  <label>New Password (optional)</label>
                  <div className="um-password-input-wrapper">
                    <input type={showEditPassword ? 'text' : 'password'} value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} placeholder="Leave blank to keep current" />
                    <PasswordToggle shown={showEditPassword} onToggle={() => setShowEditPassword(!showEditPassword)} label={showEditPassword ? 'Hide password' : 'Show password'} />
                  </div>
                </div>
              </>
            )}

            <div className="um-form-group">
              <label>Department</label>
              <select value={editForm.departmentId} onChange={(e) => setEditForm((f) => ({ ...f, departmentId: e.target.value, programId: '' }))}>
                <option value="">(none)</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>
            <div className="um-form-group">
              <label>Program</label>
              <select 
                value={editForm.programId} 
                onChange={(e) => setEditForm((f) => ({ ...f, programId: e.target.value }))}
                disabled={!editForm.departmentId}
              >
                <option value="">{editForm.departmentId ? '(none)' : 'Select Department first'}</option>
                {departmentPrograms.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>

            <div className="um-form-group full-width">
              <span className="um-segment-label">User Role</span>
              <div className="um-segmented">
                {[
                  { value: 'professor', label: 'Professor' },
                  { value: 'program_chair', label: 'Program Chair' },
                  { value: 'dean', label: 'Dean' },
                  { value: 'super_admin', label: 'Super Admin' },
                ].map((roleObj) => (
                  <button
                    key={roleObj.value}
                    type="button"
                    className={editForm.role === roleObj.value ? 'is-active' : ''}
                    onClick={() => setEditForm((f) => ({ ...f, role: roleObj.value }))}
                  >
                    {roleObj.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {editError ? <p className="um-error">{editError}</p> : null}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={closeModal}>Cancel</button>
            <button type="submit" className="modal-btn-primary" disabled={editBusy}>{editBusy ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmationModal
        open={modalMode === 'deactivate'}
        onClose={closeModal}
        onConfirm={confirmDeactivate}
        title="Deactivate User"
        message={(
          <p style={{ margin: 0 }}>
            Are you sure you want to deactivate the account for <strong>{selectedUser?.name || selectedUser?.email}</strong>?
          </p>
        )}
        confirmLabel="Deactivate User"
        confirmVariant="danger"
      />

      <ConfirmationModal
        open={modalMode === 'activate'}
        onClose={closeModal}
        onConfirm={confirmActivate}
        title="Activate User"
        message={(
          <p style={{ margin: 0 }}>
            Are you sure you want to reactivate the account for <strong>{selectedUser?.name || selectedUser?.email}</strong>?
          </p>
        )}
        confirmLabel="Activate User"
        confirmVariant="primary"
      />

      <ConfirmationModal
        open={modalMode === 'delete'}
        onClose={closeModal}
        onConfirm={confirmDelete}
        title="Delete User"
        message={(
          <p style={{ margin: 0 }}>
            This will permanently delete <strong>{selectedUser?.name || selectedUser?.email}</strong> from the system.
          </p>
        )}
        confirmLabel="Delete User"
        confirmVariant="danger"
        busy={deleteBusy}
        error={deleteError}
      >
        <p style={{ margin: '12px 0 0', color: '#666' }}>This action cannot be undone.</p>
      </ConfirmationModal>

    </main>
  );
}
