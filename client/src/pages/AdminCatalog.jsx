import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';

export default function AdminCatalog() {
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptEditId, setDeptEditId] = useState(null);
  const [deptEditName, setDeptEditName] = useState('');
  const [deptEditCode, setDeptEditCode] = useState('');

  const [progName, setProgName] = useState('');
  const [progCode, setProgCode] = useState('');
  const [progDeptId, setProgDeptId] = useState('');
  const [progEditId, setProgEditId] = useState(null);
  const [progEditName, setProgEditName] = useState('');
  const [progEditCode, setProgEditCode] = useState('');
  const [progEditDeptId, setProgEditDeptId] = useState('');

  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [error, setError] = useState('');

  async function loadDepartments() {
    const res = await apiAuth('/api/admin/catalog/departments');
    setDepartments(res.departments || []);
  }

  async function loadPrograms() {
    const query = progDeptId ? `?departmentId=${encodeURIComponent(progDeptId)}` : '';
    const res = await apiAuth(`/api/admin/catalog/programs${query}`);
    setPrograms(res.programs || []);
  }

  useEffect(() => {
    (async () => {
      try {
        await loadDepartments();
        await loadPrograms();
      } catch (err) {
        setError(err.message || 'Failed to load catalog');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createDepartment(e) {
    e.preventDefault();
    setError('');
    try {
      await apiAuth('/api/admin/catalog/departments', { method: 'POST', body: { name: deptName, code: deptCode } });
      setDeptName('');
      setDeptCode('');
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Create department failed');
    }
  }

  async function toggleDepartment(dept) {
    setError('');
    try {
      await apiAuth(`/api/admin/catalog/departments/${encodeURIComponent(dept._id)}`, {
        method: 'PATCH',
        body: { isActive: !dept.isActive },
      });
      await loadDepartments();
    } catch (err) {
      setError(err.message || 'Update department failed');
    }
  }

  function startEditDepartment(dept) {
    setDeptEditId(dept._id);
    setDeptEditName(dept.name || '');
    setDeptEditCode(dept.code || '');
  }

  function cancelEditDepartment() {
    setDeptEditId(null);
    setDeptEditName('');
    setDeptEditCode('');
  }

  async function saveDepartmentEdit(e) {
    e.preventDefault();
    if (!deptEditId) return;
    setError('');
    try {
      await apiAuth(`/api/admin/catalog/departments/${encodeURIComponent(deptEditId)}`, {
        method: 'PATCH',
        body: { name: deptEditName, code: deptEditCode },
      });
      await loadDepartments();
      cancelEditDepartment();
    } catch (err) {
      setError(err.message || 'Update department failed');
    }
  }

  async function createProgram(e) {
    e.preventDefault();
    setError('');
    try {
      await apiAuth('/api/admin/catalog/programs', {
        method: 'POST',
        body: { name: progName, code: progCode, departmentId: progDeptId },
      });
      setProgName('');
      setProgCode('');
      await loadPrograms();
    } catch (err) {
      setError(err.message || 'Create program failed');
    }
  }

  async function toggleProgram(program) {
    setError('');
    try {
      await apiAuth(`/api/admin/catalog/programs/${encodeURIComponent(program._id)}`, {
        method: 'PATCH',
        body: { isActive: !program.isActive },
      });
      await loadPrograms();
    } catch (err) {
      setError(err.message || 'Update program failed');
    }
  }

  function startEditProgram(program) {
    setProgEditId(program._id);
    setProgEditName(program.name || '');
    setProgEditCode(program.code || '');
    setProgEditDeptId(program.department?._id || program.department || '');
  }

  function cancelEditProgram() {
    setProgEditId(null);
    setProgEditName('');
    setProgEditCode('');
    setProgEditDeptId('');
  }

  async function saveProgramEdit(e) {
    e.preventDefault();
    if (!progEditId) return;
    setError('');
    try {
      await apiAuth(`/api/admin/catalog/programs/${encodeURIComponent(progEditId)}`, {
        method: 'PATCH',
        body: { name: progEditName, code: progEditCode, departmentId: progEditDeptId || undefined },
      });
      await loadPrograms();
      cancelEditProgram();
    } catch (err) {
      setError(err.message || 'Update program failed');
    }
  }

  return (
    <main>
      <h2>Super Admin: Catalog</h2>
      {error ? <p>{error}</p> : null}

      <section>
        <h3>Departments</h3>
        <form onSubmit={createDepartment}>
          <div>
            <label>
              Name <input value={deptName} onChange={(e) => setDeptName(e.target.value)} />
            </label>
          </div>
          <div>
            <label>
              Code <input value={deptCode} onChange={(e) => setDeptCode(e.target.value)} />
            </label>
          </div>
          <button type="submit">Create Department</button>
        </form>
        {deptEditId ? (
          <div>
            <h4>Edit Department</h4>
            <form onSubmit={saveDepartmentEdit}>
              <div>
                <label>
                  Name <input value={deptEditName} onChange={(e) => setDeptEditName(e.target.value)} />
                </label>
              </div>
              <div>
                <label>
                  Code <input value={deptEditCode} onChange={(e) => setDeptEditCode(e.target.value)} />
                </label>
              </div>
              <button type="submit">Save</button>{' '}
              <button type="button" onClick={cancelEditDepartment}>
                Cancel
              </button>
            </form>
          </div>
        ) : null}
        <ul>
          {departments.map((d) => (
            <li key={d._id}>
              {d.code} - {d.name} | active: {String(d.isActive)}{' '}
              <button onClick={() => toggleDepartment(d)}>{d.isActive ? 'Deactivate' : 'Activate'}</button>
              {' '}
              <button onClick={() => startEditDepartment(d)}>Edit</button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Programs</h3>
        <div>
          <label>
            Filter by department
            <select value={progDeptId} onChange={(e) => setProgDeptId(e.target.value)}>
              <option value="">(all)</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.code} - {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <form onSubmit={createProgram}>
          <div>
            <label>
              Department
              <select value={progDeptId} onChange={(e) => setProgDeptId(e.target.value)}>
                <option value="">Select...</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label>
              Name <input value={progName} onChange={(e) => setProgName(e.target.value)} />
            </label>
          </div>
          <div>
            <label>
              Code <input value={progCode} onChange={(e) => setProgCode(e.target.value)} />
            </label>
          </div>
          <button type="submit" disabled={!progDeptId}>
            Create Program
          </button>
        </form>
        {progEditId ? (
          <div>
            <h4>Edit Program</h4>
            <form onSubmit={saveProgramEdit}>
              <div>
                <label>
                  Department
                  <select value={progEditDeptId} onChange={(e) => setProgEditDeptId(e.target.value)}>
                    <option value="">Select...</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Name <input value={progEditName} onChange={(e) => setProgEditName(e.target.value)} />
                </label>
              </div>
              <div>
                <label>
                  Code <input value={progEditCode} onChange={(e) => setProgEditCode(e.target.value)} />
                </label>
              </div>
              <button type="submit">Save</button>{' '}
              <button type="button" onClick={cancelEditProgram}>
                Cancel
              </button>
            </form>
          </div>
        ) : null}
        <ul>
          {programs.map((p) => (
            <li key={p._id}>
              {p.code} - {p.name} | dept:{' '}
              {p.department?.code ? `${p.department.code}` : String(p.department)} | active: {String(p.isActive)}{' '}
              <button onClick={() => toggleProgram(p)}>{p.isActive ? 'Deactivate' : 'Activate'}</button>
              {' '}
              <button onClick={() => startEditProgram(p)}>Edit</button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
