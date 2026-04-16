import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/AdminUsers.css';
import { Modal } from '../components/Modal.jsx';

export default function AdminUsers() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);

  // Modal states
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | 'deactivate'
  const [selectedUser, setSelectedUser] = useState(null);

  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [editForm, setEditForm] = useState({
    name: '', email: '', role: '', password: '', departmentId: '', programId: '', studentId: '', alumniId: '',
  });

  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '', email: '', role: 'student', password: '', departmentId: '', programId: '', studentId: '', alumniId: '',
  });

  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');

  const users = useMemo(() => (data && data.users ? data.users : []), [data]);

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
      fetchUsersList(searchQuery, filterRole, filterDepartment);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, filterRole, filterDepartment]);

  function closeModal() {
    setModalMode(null);
    setSelectedUser(null);
    setCreateError('');
    setEditError('');
    setCreateForm({ name: '', email: '', role: 'student', password: '', departmentId: '', programId: '', studentId: '', alumniId: '' });
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
      alert(err.message || 'Deactivate failed');
    }
  }

  function startActivate(user) {
    setSelectedUser(user);
    setModalMode('activate');
  }

  async function confirmActivate() {
    if (!selectedUser) return;
    try {
      await apiAuth(`/api/auth/users/${encodeURIComponent(selectedUser._id)}/activate`, { method: 'PATCH', body: {} });
      await load();
      closeModal();
    } catch (err) {
      alert(err.message || 'Activate failed');
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (!selectedUser) return;
    setEditBusy(true);
    setEditError('');
    try {
      const body = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        departmentId: editForm.departmentId || null,
        programId: editForm.programId || null,
      };
      if (editForm.role === 'student' && editForm.studentId) body.studentId = editForm.studentId;
      if (editForm.role === 'alumni' && editForm.alumniId) body.alumniId = editForm.alumniId;
      if (editForm.password) body.password = editForm.password;

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

  return (
    <main className="um-page">
      {/* ── Page Header ── */}
      <div className="um-header">
        <div>
          <h1 className="um-title">User Management</h1>
          <p className="um-subtitle">Create, edit, and manage all system users</p>
        </div>
        <button className="um-btn-add" onClick={startCreate}>
          + Add User
        </button>
      </div>

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
      </div>

      {error ? <p className="um-error">{error}</p> : null}

      {/* ── User Table ── */}
      <div className="um-table-wrap">
        {busy ? <p className="um-loading">Loading users...</p> : (
          <table className="um-table">
            <thead>
              <tr><th>User</th><th>Role</th><th>Department</th><th>Program</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {users.length === 0 ? <tr><td colSpan={6} className="um-empty">No users found.</td></tr> : (
                users.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <div className="um-user-name">{u.name}</div>
                      <div className="um-user-email">{u.email}</div>
                    </td>
                    <td><span className={`um-badge um-badge--${u.role}`}>{formatRoleLabel(u.role)}</span></td>
                    <td>{u.department?.code ? <span className="um-badge um-badge--dept">{u.department.code}</span> : <span className="um-none">(none)</span>}</td>
                    <td>{u.program?.code ? <span className="um-badge um-badge--dept">{u.program.code}</span> : <span className="um-none">(none)</span>}</td>
                    <td><span className={`um-status ${u.isActive ? 'um-status--active' : 'um-status--inactive'}`}>● {u.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td className="um-actions-cell">
                      <button className="um-btn-edit" onClick={() => startEdit(u)}>Edit</button>
                      {u.isActive ? <button className="um-btn-deactivate" onClick={() => startDeactivate(u)}>Deactivate</button>
                                  : <button className="um-btn-activate" onClick={() => startActivate(u)}>Activate</button>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      <Modal open={modalMode === 'create'} onClose={closeModal} title="Creating User">
        <form onSubmit={submitCreate}>
          <div className="modal-form-grid">
            <div className="modal-form-group">
              <label>Full Name</label>
              <input value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="ex. Juan Dela Cruz" required />
            </div>
            <div className="modal-form-group">
              <label>Role</label>
              <select value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="student">Student</option>
                <option value="alumni">Alumni</option>
                <option value="super_admin">Super Admin</option>
                <option value="dean">Dean</option>
                <option value="program_chair">Program Chair</option>
                <option value="professor">Professor</option>
              </select>
            </div>
            <div className="modal-form-group">
              <label>Email Address</label>
              <input type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} placeholder="ex. juandelacruz@gmail.com" required />
            </div>
            <div className="modal-form-group">
              <label>Password</label>
              <div className="modal-password-wrapper">
                <input type={showCreatePassword ? 'text' : 'password'} value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} required />
                <button type="button" onClick={() => setShowCreatePassword(!showCreatePassword)} className="modal-password-toggle">{showCreatePassword ? '👁️' : '👁️‍🗨️'}</button>
              </div>
            </div>
            <div className="modal-form-group">
              <label>{createForm.role === 'alumni' ? 'Alumni ID' : 'Student ID'} {(createForm.role !== 'student' && createForm.role !== 'alumni') ? '(N/A)' : ''}</label>
              <input value={createForm.role === 'alumni' ? createForm.alumniId : createForm.studentId} onChange={(e) => {
                if (createForm.role === 'alumni') setCreateForm(f => ({ ...f, alumniId: e.target.value }));
                else setCreateForm(f => ({ ...f, studentId: e.target.value }));
              }} disabled={createForm.role !== 'student' && createForm.role !== 'alumni'} />
            </div>
            <div className="modal-form-group">
              <label>Program</label>
              <select value={createForm.programId} onChange={(e) => setCreateForm((f) => ({ ...f, programId: e.target.value }))}>
                <option value="">(none)</option>
                {createDepartmentPrograms.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>
            <div className="modal-form-group full-width">
              <label>Department</label>
              <select value={createForm.departmentId} onChange={(e) => setCreateForm((f) => ({ ...f, departmentId: e.target.value, programId: '' }))}>
                <option value="">(none)</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          {createError ? <p className="um-error">{createError}</p> : null}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={closeModal}>Cancel</button>
            <button type="submit" className="modal-btn-primary" disabled={createBusy}>{createBusy ? 'Creating...' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={modalMode === 'edit'} onClose={closeModal} title={`Editing User   ${selectedUser?.email ? `(${selectedUser.email})`:''}`}>
        <form onSubmit={submitEdit}>
          <div className="modal-form-grid">
            <div className="modal-form-group">
              <label>Full Name</label>
              <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="modal-form-group">
              <label>Role</label>
              <select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="student">Student</option>
                <option value="alumni">Alumni</option>
                <option value="super_admin">Super Admin</option>
                <option value="dean">Dean</option>
                <option value="program_chair">Program Chair</option>
                <option value="professor">Professor</option>
              </select>
            </div>
            <div className="modal-form-group">
              <label>Email Address</label>
              <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} required />
            </div>
            <div className="modal-form-group">
              <label>New Password (optional)</label>
              <div className="modal-password-wrapper">
                <input type={showEditPassword ? 'text' : 'password'} value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} placeholder="Leave blank to keep current" />
                <button type="button" onClick={() => setShowEditPassword(!showEditPassword)} className="modal-password-toggle">{showEditPassword ? '👁️' : '👁️‍🗨️'}</button>
              </div>
            </div>
            <div className="modal-form-group">
              <label>{editForm.role === 'alumni' ? 'Alumni ID' : 'Student ID'} {(editForm.role !== 'student' && editForm.role !== 'alumni') ? '(N/A)' : ''}</label>
              <input value={editForm.role === 'alumni' ? editForm.alumniId : editForm.studentId} onChange={(e) => {
                if (editForm.role === 'alumni') setEditForm(f => ({ ...f, alumniId: e.target.value }));
                else setEditForm(f => ({ ...f, studentId: e.target.value }));
              }} disabled={editForm.role !== 'student' && editForm.role !== 'alumni'} />
            </div>
            <div className="modal-form-group">
              <label>Program</label>
              <select value={editForm.programId} onChange={(e) => setEditForm((f) => ({ ...f, programId: e.target.value }))}>
                <option value="">(none)</option>
                {departmentPrograms.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>
            <div className="modal-form-group full-width">
              <label>Department</label>
              <select value={editForm.departmentId} onChange={(e) => setEditForm((f) => ({ ...f, departmentId: e.target.value, programId: '' }))}>
                <option value="">(none)</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          {editError ? <p className="um-error">{editError}</p> : null}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={closeModal}>Cancel</button>
            <button type="submit" className="modal-btn-primary" disabled={editBusy}>{editBusy ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={modalMode === 'deactivate'} onClose={closeModal} title="Deactivate User">
        <div style={{ marginBottom: '24px' }}>
          Are you sure you want to deactivate the account for <strong>{selectedUser?.name || selectedUser?.email}</strong>?
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={closeModal}>Cancel</button>
          <button type="button" className="modal-btn-danger" onClick={confirmDeactivate}>Deactivate User</button>
        </div>
      </Modal>

      <Modal open={modalMode === 'activate'} onClose={closeModal} title="Activate User">
        <div style={{ marginBottom: '24px' }}>
          Are you sure you want to reactivate the account for <strong>{selectedUser?.name || selectedUser?.email}</strong>?
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={closeModal}>Cancel</button>
          <button type="button" className="modal-btn-primary" style={{ backgroundColor: '#2e7d32' }} onClick={confirmActivate}>Activate User</button>
        </div>
      </Modal>

    </main>
  );
}
