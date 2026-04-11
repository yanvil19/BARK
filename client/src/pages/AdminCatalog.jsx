import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';

export default function AdminCatalog() {
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [progName, setProgName] = useState('');
  const [progCode, setProgCode] = useState('');
  const [progDeptId, setProgDeptId] = useState('');

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
        <button onClick={loadDepartments}>Refresh</button>
        <ul>
          {departments.map((d) => (
            <li key={d._id}>
              {d.code} - {d.name} | active: {String(d.isActive)}{' '}
              <button onClick={() => toggleDepartment(d)}>{d.isActive ? 'Deactivate' : 'Activate'}</button>
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
          <button onClick={loadPrograms}>Refresh</button>
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
        <ul>
          {programs.map((p) => (
            <li key={p._id}>
              {p.code} - {p.name} | dept:{' '}
              {p.department?.code ? `${p.department.code}` : String(p.department)} | active: {String(p.isActive)}{' '}
              <button onClick={() => toggleProgram(p)}>{p.isActive ? 'Deactivate' : 'Activate'}</button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

