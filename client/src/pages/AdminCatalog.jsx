import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/AdminCatalog.css';

export default function AdminCatalog() {
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptEditId, setDeptEditId] = useState(null);
  const [deptEditName, setDeptEditName] = useState('');
  const [deptEditCode, setDeptEditCode] = useState('');
  const [showForm, setShowForm] = useState(false); // For department form
  const [showProgramForm, setShowProgramForm] = useState(false); // For program form

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

  function deleteEditedDepartment() {
    if (!deptEditId) return;

    const ok = window.confirm(
      'Are you sure you want to delete this department?'
    );

    if (!ok) return;

    console.log('Deleting department:', deptEditId);

    cancelEditDepartment();
  }

  return (
    <main className="adminCatalog-page-container">
      <header className="adminCatalog-page-header">
        <h2>Super Admin Catalog</h2>
        <p className="adminCatalog-subtitle">Manage schools (departments) and programs</p>
      </header>
      {error ? <p>{error}</p> : null}

      <section className="adminCatalog-departments">
        <header className="adminCatalog-departments-header">
          <div className="titles">
            <h3>Schools of NU Laguna</h3>
            <h4>{departments.length} schools registered in the system</h4>
          </div>

          <div className="actions">
            <button onClick={() => setShowForm(true)}>
              + Add Department
            </button>

            {showForm && (
              <div
                className="adminCatalog-modal-overlay"
                onClick={() => setShowForm(false)}
              >
                <div
                  className="adminCatalog-modal"
                  onClick={(e) => e.stopPropagation()}
                >
                  
                  <div className="adminCatalog-modal-header">
                    <h3>Create Department</h3>
                    
                    <button
                      type="button"
                      className="adminCatalog-modal-close"
                      onClick={() => setShowForm(false)}
                      aria-label="Close modal"
                    >
                      x
                    </button>
                  </div>

                  <div className="adminCatalog-modal-body">
                    <form onSubmit={createDepartment}>
                      <div className="adminCatalog-form-group">
                        <label className='form-title'>
                          Department Name
                        </label>
                        <input
                            className='input-title'
                            value={deptName}
                            onChange={(e) => setDeptName(e.target.value)}
                            placeholder='e.g. School of Engineering And Architecture'
                          />
                      </div>

                      <div className="adminCatalog-form-group">
                        <label className='form-title'>
                          Acronym / Code
                        </label>
                        <input
                            className='input-title'
                            value={deptCode}
                            onChange={(e) => setDeptCode(e.target.value)}
                            placeholder='e.g. SEA'
                          />
                      </div>
                    </form>
                  </div>
                  <div className="adminCatalog-modal-footer">
                        <button className="adminCatalog-cancelbtn" onClick={() => setShowForm(false)}>
                          Cancel
                        </button>

                        <button className="adminCatalog-primarybtn" onClick={createDepartment} disabled={!deptName || !deptCode}>
                          Save Department
                        </button>
                      </div>
                </div>
              </div>
            )}
          </div>
        </header>

        <table className="adminCatalog-table">
          <thead>
            <tr>
              <th className="adminCatalog-dept-code">Acronym</th>
              <th className="adminCatalog-dept-name">School Name</th>
              <th className="adminCatalog-dept-programs">Programs</th>
              <th className="adminCatalog-dept-status">Status</th>
              <th className="adminCatalog-dept-actions">Actions</th>
            </tr>
          </thead>

          <tbody>
            {departments.map((d) => {
              const programCount = programs.filter(
                (p) => (p.department?._id || p.department) === d._id
              ).length;

              return (
                <tr key={d._id}>
                  <td className="adminCatalog-dept-code"><span className="adminCatalog-dept-pill">{d.code}</span></td>

                  <td className="adminCatalog-dept-name">{d.name}</td>

                  <td className="adminCatalog-dept-programs">
                    {programCount} {programCount === 1 ? 'program' : 'programs'}
                  </td>
             
                  <td className="adminCatalog-dept-status"
                    data-status={d.isActive ? 'active' : 'inactive'}
                  >●
                    {d.isActive ? ' Active' : ' Inactive'}
                  </td>

                  <td className="adminCatalog-dept-actions">
                    <button className="adminCatalog-btn-edit" onClick={() => startEditDepartment(d)}>
                      Edit
                    </button>
                      
                    <button className="adminCatalog-btn-danger" onClick={() => toggleDepartment(d)}>
                      {d.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

        {deptEditId && (
          <div
            className="adminCatalog-modal-overlay"
            onClick={cancelEditDepartment}
          >
            <div
              className="adminCatalog-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="adminCatalog-modal-header">
                <h3>Edit Department</h3>

                <button
                  type="button"
                  className="adminCatalog-modal-close"
                  onClick={cancelEditDepartment}
                  aria-label="Close modal"
                >
                  x
                </button>
              </div>

              <div className="adminCatalog-modal-body">
                <form onSubmit={saveDepartmentEdit}>
                  <div className="adminCatalog-form-group">
                    <label className="form-title">Department Name</label>
                    <input
                      className="input-title"
                      value={deptEditName}
                      onChange={(e) => setDeptEditName(e.target.value)}
                    />
                  </div>

                  <div className="adminCatalog-form-group">
                    <label className="form-title">Acronym / Code</label>
                    <input
                      className="input-title"
                      value={deptEditCode}
                      onChange={(e) => setDeptEditCode(e.target.value)}
                    />
                  </div>
                </form>
              </div>

              <div className="adminCatalog-modal-footer">
                <button
                  className="adminCatalog-deletebtn"
                  type="button"
                  onClick={deleteEditedDepartment}
                >
                  Delete Department
                </button>

                <button
                  className="adminCatalog-cancelbtn"
                  type="button"
                  onClick={cancelEditDepartment}
                >
                  Cancel
                </button>

                <button
                  className="adminCatalog-primarybtn"
                  onClick={saveDepartmentEdit}
                  disabled={!deptEditName || !deptEditCode}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}





      <section className="adminCatalog-programs">
        <header className="adminCatalog-programs-header">
          <div className="titles">
            <h3>Programs</h3>
            <h4>{programs.length} programs across all departments</h4>
          </div>

          <div className="actions">
            <label className="adminCatalog-program-filter">
              <select
                value={progDeptId}
                onChange={(e) => setProgDeptId(e.target.value)}
              >
                <option value="">Filter: All Departments</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </label>

            <button onClick={() => setShowProgramForm(true)}>
              + Add Program
            </button>
          </div>
        </header>

        <table className="adminCatalog-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Program Name</th>
              <th>Department</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {programs.map((p) => (
              <tr key={p._id}>
                <td className="adminCatalog-program-code">
                  <span className="adminCatalog-dept-pill">{p.code}</span>
                </td>

                <td>{p.name}</td>

                <td className="adminCatalog-program-dept">
                  <span className="adminCatalog-dept-pill">
                    {p.department?.code || p.department}
                  </span>
                </td>

                <td
                  className="adminCatalog-dept-status"
                  data-status={p.isActive ? "active" : "inactive"}
                >
                  ● {p.isActive ? "Active" : "Inactive"}
                </td>

                <td className="adminCatalog-dept-actions">
                  <button
                    className="adminCatalog-btn adminCatalog-btn-edit"
                    onClick={() => startEditProgram(p)}
                  >
                    Edit
                  </button>

                  <button
                    className="adminCatalog-btn adminCatalog-btn-danger"
                    onClick={() => toggleProgram(p)}
                  >
                    {p.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

        {showProgramForm && (
          <div
            className="adminCatalog-modal-overlay"
            onClick={() => setShowProgramForm(false)}
          >
            <div
              className="adminCatalog-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="adminCatalog-modal-header">
                <h3>Add Program</h3>
                <button
                  className="adminCatalog-modal-close"
                  onClick={() => setShowProgramForm(false)}
                >
                  x
                </button>
              </div>

              <div className="adminCatalog-modal-body">
                <form onSubmit={createProgram}>
                  <div className="adminCatalog-form-group">
                    <label className="form-title">Department</label>
                    <select
                      className="input-title"
                      value={progDeptId}
                      onChange={(e) => setProgDeptId(e.target.value)}
                    >
                      <option value="">Select department...</option>
                      {departments.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.code} - {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="adminCatalog-form-group">
                    <label className="form-title">Program Name</label>
                    <input
                      className="input-title"
                      value={progName}
                      onChange={(e) => setProgName(e.target.value)}
                      placeholder='e.g. BS Tourism'
                    />
                  </div>

                  <div className="adminCatalog-form-group">
                    <label className="form-title">Program Code</label>
                    <input
                      className="input-title"
                      value={progCode}
                      onChange={(e) => setProgCode(e.target.value)}
                      placeholder='e.g. BSTM'
                    />
                  </div>
                </form>
              </div>

              <div className="adminCatalog-modal-footer">
                <button
                  className="adminCatalog-cancelbtn"
                  onClick={() => setShowProgramForm(false)}
                >
                  Cancel
                </button>

                <button
                  className="adminCatalog-primarybtn"
                  onClick={createProgram}
                  disabled={!progDeptId || !progName || !progCode}
                >
                  Save Program
                </button>
              </div>
            </div>
          </div>
        )}

        {progEditId && (
          <div
            className="adminCatalog-modal-overlay"
            onClick={cancelEditProgram}
          >
            <div
              className="adminCatalog-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="adminCatalog-modal-header">
                <h3>Edit Program</h3>
                <button
                  className="adminCatalog-modal-close"
                  onClick={cancelEditProgram}
                >
                  x
                </button>
              </div>

              <div className="adminCatalog-modal-body">
                <form onSubmit={saveProgramEdit}>
                  <div className="adminCatalog-form-group">
                    <label className="form-title">Department</label>
                    <select
                      className="input-title"
                      value={progEditDeptId}
                      onChange={(e) => setProgEditDeptId(e.target.value)}
                    >
                      <option value="">Select...</option>
                      {departments.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.code} - {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="adminCatalog-form-group">
                    <label className="form-title">Program Name</label>
                    <input
                      className="input-title"
                      value={progEditName}
                      onChange={(e) => setProgEditName(e.target.value)}
                    />
                  </div>

                  <div className="adminCatalog-form-group">
                    <label className="form-title">Program Code</label>
                    <input
                      className="input-title"
                      value={progEditCode}
                      onChange={(e) => setProgEditCode(e.target.value)}
                    />
                  </div>
                </form>
              </div>

              <div className="adminCatalog-modal-footer">
                <button
                  className="adminCatalog-cancelbtn"
                  onClick={cancelEditProgram}
                >
                  Cancel
                </button>

                <button
                  className="adminCatalog-primarybtn"
                  onClick={saveProgramEdit}
                  disabled={!progEditDeptId || !progEditName || !progEditCode}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
    </main>
  );
}
