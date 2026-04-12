import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../lib/api.js';

export default function AdminUsers() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    role: '',
    password: '',
    departmentId: '',
    programId: '',
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    role: 'professor',
    password: '',
    departmentId: '',
    programId: '',
  });

  const users = useMemo(() => (data && data.users ? data.users : []), [data]);

  async function load() {
    setBusy(true);
    setError('');
    try {
      const res = await apiAuth('/api/auth/users?limit=100');
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setBusy(false);
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
    load();
    loadCatalog();
  }, []);

  async function deactivateUser(user) {
    if (!confirm(`Deactivate ${user.email}?`)) return;
    try {
      await apiAuth(`/api/auth/users/${encodeURIComponent(user._id)}/deactivate`, { method: 'PATCH', body: {} });
      await load();
    } catch (err) {
      alert(err.message || 'Deactivate failed');
    }
  }

  async function activateUser(user) {
    if (!confirm(`Activate ${user.email}?`)) return;
    try {
      await apiAuth(`/api/auth/users/${encodeURIComponent(user._id)}/activate`, { method: 'PATCH', body: {} });
      await load();
    } catch (err) {
      alert(err.message || 'Activate failed');
    }
  }

  function startEdit(user) {
    setEditError('');
    setEditingId(user._id);
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      role: user.role || '',
      password: '',
      departmentId: user.department?._id || user.department || '',
      programId: user.program?._id || user.program || '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
    setEditForm({ name: '', email: '', role: '', password: '', departmentId: '', programId: '' });
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (!editingId) return;
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
      if (editForm.password) body.password = editForm.password;

      await apiAuth(`/api/auth/users/${encodeURIComponent(editingId)}`, { method: 'PATCH', body });
      await load();
      cancelEdit();
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

      await apiAuth('/api/auth/register', { method: 'POST', body });
      setCreateForm({ name: '', email: '', role: 'professor', password: '', departmentId: '', programId: '' });
      await load();
    } catch (err) {
      setCreateError(err.message || 'Create failed');
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <main>
      <h2>Super Admin: Users</h2>
      <button onClick={load} disabled={busy}>
        Refresh
      </button>
      {error ? <p>{error}</p> : null}
      {busy ? <p>Loading...</p> : null}

      {!editingId ? (
        <section>
          <h3>Create User</h3>
          <form onSubmit={submitCreate}>
            <div>
              <label>
                Name{' '}
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
            </div>
            <div>
              <label>
                Email{' '}
                <input
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
            </div>
            <div>
              <label>
                Password{' '}
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                />
              </label>
            </div>
            <div>
              <label>
                Role{' '}
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                >
                  <option value="super_admin">super_admin</option>
                  <option value="dean">dean</option>
                  <option value="program_chair">program_chair</option>
                  <option value="professor">professor</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Department{' '}
                <select
                  value={createForm.departmentId}
                  onChange={(e) => {
                    const nextDepartmentId = e.target.value;
                    setCreateForm((f) => ({ ...f, departmentId: nextDepartmentId, programId: '' }));
                  }}
                >
                  <option value="">(none)</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.code} - {d.name} {d.isActive ? '' : '(inactive)'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <label>
                Program{' '}
                <select
                  value={createForm.programId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, programId: e.target.value }))}
                >
                  <option value="">(none)</option>
                  {createDepartmentPrograms.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.code} - {p.name} {p.isActive ? '' : '(inactive)'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" disabled={createBusy}>
              {createBusy ? 'Creating...' : 'Create'}
            </button>
          </form>
          {createError ? <p>{createError}</p> : null}
        </section>
      ) : null}

      {editingId ? (
        <section>
          <h3>Edit User</h3>
          <form onSubmit={submitEdit}>
            <div>
              <label>
                Name <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
            </div>
            <div>
              <label>
                Email{' '}
                <input value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
            </div>
            <div>
              <label>
                Role{' '}
                <select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}>
                  <option value="super_admin">super_admin</option>
                  <option value="dean">dean</option>
                  <option value="program_chair">program_chair</option>
                  <option value="professor">professor</option>
                  <option value="student">student</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                New Password (optional){' '}
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                />
              </label>
            </div>
            <div>
              <label>
                Department{' '}
                <select
                  value={editForm.departmentId}
                  onChange={(e) => {
                    const nextDepartmentId = e.target.value;
                    setEditForm((f) => ({ ...f, departmentId: nextDepartmentId, programId: '' }));
                  }}
                >
                  <option value="">(none)</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.code} - {d.name} {d.isActive ? '' : '(inactive)'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <label>
                Program{' '}
                <select
                  value={editForm.programId}
                  onChange={(e) => setEditForm((f) => ({ ...f, programId: e.target.value }))}
                >
                  <option value="">(none)</option>
                  {departmentPrograms.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.code} - {p.name} {p.isActive ? '' : '(inactive)'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" disabled={editBusy}>
              {editBusy ? 'Saving...' : 'Save'}
            </button>{' '}
            <button type="button" onClick={cancelEdit} disabled={editBusy}>
              Cancel
            </button>
          </form>
          {editError ? <p>{editError}</p> : null}
        </section>
      ) : null}

      <section>
        <h3>User List</h3>
        <ul>
          {users.map((u) => (
            <li key={u._id}>
              <div>
                <strong>{u.email}</strong> | {u.role} | active: {String(u.isActive)} | dept:{' '}
                {u.department?.code ? `${u.department.code}` : u.department ? String(u.department) : '(none)'} | program:{' '}
                {u.program?.code ? `${u.program.code}` : u.program ? String(u.program) : '(none)'}
              </div>
              <div>
                <button onClick={() => startEdit(u)}>Edit</button>{' '}
                {u.isActive ? (
                  <button onClick={() => deactivateUser(u)}>Deactivate</button>
                ) : (
                  <button onClick={() => activateUser(u)}>Activate</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {data ? (
        <details>
          <summary>Raw Response</summary>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </details>
      ) : null}
    </main>
  );
}
