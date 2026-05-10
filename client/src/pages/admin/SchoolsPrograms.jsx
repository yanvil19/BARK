import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/AdminUsers.css';
import { Modal } from '../components/Modal.jsx';

export default function SchoolsPrograms() {
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
  const [toggleProgramData, setToggleProgramData] = useState(null); // { program, action: 'activate' | 'deactivate' }
  const [toggleDeptData, setToggleDeptData] = useState(null); // { dept, action: 'activate' | 'deactivate' }

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

  
  useEffect(() => {
    loadPrograms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progDeptId]);


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

  async function confirmToggleDepartment() {
    if (!toggleDeptData) return;
    const { dept } = toggleDeptData;
    setError('');
    try {
      await apiAuth(`/api/admin/catalog/departments/${encodeURIComponent(dept._id)}`, {
        method: 'PATCH',
        body: { isActive: !dept.isActive },
      });
      await loadDepartments();
      setToggleDeptData(null);
    } catch (err) {
      setError(err.message || 'Update department failed');
    }
  }

  function handleToggleDepartment(dept) {
    setToggleDeptData({
      dept,
      action: dept.isActive ? 'deactivate' : 'activate'
    });
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

  async function confirmToggleProgram() {
    if (!toggleProgramData) return;
    const { program } = toggleProgramData;
    setError('');
    try {
      await apiAuth(`/api/admin/catalog/programs/${encodeURIComponent(program._id)}`, {
        method: 'PATCH',
        body: { isActive: !program.isActive },
      });
      await loadPrograms();
      setToggleProgramData(null);
    } catch (err) {
      setError(err.message || 'Update program failed');
    }
  }

  function handleToggleProgram(program) {
    setToggleProgramData({
      program,
      action: program.isActive ? 'deactivate' : 'activate'
    });
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
    <main className="um-page">
      {/* ── Page Header ── */}
      <header className="um-page-header">
        <div className="um-header">
          <div>
            <h1 className="um-title">Schools and Program</h1>
            <p className="um-subtitle">Manage system-wide departments and programs</p>
          </div>
          <div className="um-actions" style={{ display: 'flex', gap: '12px' }}>
            <button className="um-btn-add" onClick={() => setShowForm(true)}>
              + Add School
            </button>
            <button className="um-btn-add" style={{ background: '#f0f2f8', color: 'var(--primary-bg)', border: '1px solid #d0d5dd' }} onClick={() => setShowProgramForm(true)}>
              + Add Program
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="um-error" style={{ margin: '0 20px 16px' }}>{error}</p> : null}

      <div style={{ padding: '0 20px' }}>
        {/* ── Departments Table ── */}
        <section className="um-table-wrap">
          <div className="table-section-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e4e7ec', background: '#fafbff' }}>
            <h3 className="um-user-name" style={{ fontSize: '16px' }}>Schools of NU Laguna</h3>
          </div>
          <table className="um-table">
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Acronym</th>
                <th>School Name</th>
                <th style={{ width: '150px', textAlign: 'center' }}>Programs</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Status</th>
                <th style={{ width: '200px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {departments.length === 0 ? (
                <tr><td colSpan="5" className="um-empty">No departments found.</td></tr>
              ) : (
                departments.map((d) => {
                  const programCount = programs.filter(
                    (p) => (p.department?._id || p.department) === d._id
                  ).length;

                  return (
                    <tr key={d._id}>
                      <td><span className="um-badge um-badge--dept">{d.code}</span></td>
                      <td style={{ fontWeight: '600' }}>{d.name}</td>
                      <td style={{ textAlign: 'center', color: '#666' }}>{programCount}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`um-status ${d.isActive ? 'um-status--active' : 'um-status--inactive'}`}>
                          ● {d.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="um-actions-cell" style={{ textAlign: 'right' }}>
                        <button className="um-btn-edit" onClick={() => startEditDepartment(d)}>Edit</button>
                        <button 
                          className={d.isActive ? "um-btn-deactivate" : "um-btn-activate"} 
                          onClick={() => handleToggleDepartment(d)}
                        >
                          {d.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        {/* ── Programs Section ── */}
        <section className="um-table-wrap">
          <div className="table-section-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e4e7ec', background: '#fafbff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="um-user-name" style={{ fontSize: '16px' }}>Academic Programs</h3>
            <div className="um-filters" style={{ marginBottom: 0 }}>
              <select
                className="um-filter-select"
                style={{ padding: '6px 12px', minWidth: '220px' }}
                value={progDeptId}
                onChange={(e) => setProgDeptId(e.target.value)}
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>{d.code} - {d.name}</option>
                ))}
              </select>
            </div>
          </div>
          <table className="um-table">
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Code</th>
                <th>Program Name</th>
                <th style={{ width: '150px' }}>Department</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Status</th>
                <th style={{ width: '200px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {programs.length === 0 ? (
                <tr><td colSpan="5" className="um-empty">No programs found.</td></tr>
              ) : (
                programs.map((p) => (
                  <tr key={p._id}>
                    <td><span className="um-badge um-badge--dept">{p.code}</span></td>
                    <td style={{ fontWeight: '600' }}>{p.name}</td>
                    <td><span className="um-badge um-badge--dept" style={{ background: '#f0f2f8', color: '#555', border: '1px solid #d0d5dd' }}>{p.department?.code || p.department}</span></td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`um-status ${p.isActive ? 'um-status--active' : 'um-status--inactive'}`}>
                        ● {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="um-actions-cell" style={{ textAlign: 'right' }}>
                      <button className="um-btn-edit" onClick={() => startEditProgram(p)}>Edit</button>
                      <button 
                        className={p.isActive ? "um-btn-deactivate" : "um-btn-activate"} 
                        onClick={() => handleToggleProgram(p)}
                      >
                        {p.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>

      {/* ── Modals ── */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add New Department">
        <form onSubmit={createDepartment}>
          <div className="modal-form-grid">
            <div className="modal-form-group full-width">
              <label>Department Name</label>
              <input
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder='e.g. School of Engineering And Architecture'
                required
              />
            </div>
            <div className="modal-form-group full-width">
              <label>Acronym / Code</label>
              <input
                value={deptCode}
                onChange={(e) => setDeptCode(e.target.value)}
                placeholder='e.g. SEA'
                required
              />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="modal-btn-primary" disabled={!deptName || !deptCode}>Save Department</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deptEditId} onClose={cancelEditDepartment} title="Edit Department">
        <form onSubmit={saveDepartmentEdit}>
          <div className="modal-form-grid">
            <div className="modal-form-group full-width">
              <label>Department Name</label>
              <input
                value={deptEditName}
                onChange={(e) => setDeptEditName(e.target.value)}
                required
              />
            </div>
            <div className="modal-form-group full-width">
              <label>Acronym / Code</label>
              <input
                value={deptEditCode}
                onChange={(e) => setDeptEditCode(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-btn-danger" style={{ marginRight: 'auto' }} onClick={deleteEditedDepartment}>Delete</button>
            <button type="button" className="modal-btn-cancel" onClick={cancelEditDepartment}>Cancel</button>
            <button type="submit" className="modal-btn-primary" disabled={!deptEditName || !deptEditCode}>Save Changes</button>
          </div>
        </form>
      </Modal>

      <Modal open={showProgramForm} onClose={() => setShowProgramForm(false)} title="Add New Program">
        <form onSubmit={createProgram}>
          <div className="modal-form-grid">
            <div className="modal-form-group full-width">
              <label>Department</label>
              <select
                value={progDeptId}
                onChange={(e) => setProgDeptId(e.target.value)}
                required
              >
                <option value="">Select department...</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>{d.code} - {d.name}</option>
                ))}
              </select>
            </div>
            <div className="modal-form-group full-width">
              <label>Program Name</label>
              <input
                value={progName}
                onChange={(e) => setProgName(e.target.value)}
                placeholder='e.g. BS Tourism'
                required
              />
            </div>
            <div className="modal-form-group full-width">
              <label>Program Code</label>
              <input
                value={progCode}
                onChange={(e) => setProgCode(e.target.value)}
                placeholder='e.g. BSTM'
                required
              />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={() => setShowProgramForm(false)}>Cancel</button>
            <button type="submit" className="modal-btn-primary" disabled={!progDeptId || !progName || !progCode}>Save Program</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!progEditId} onClose={cancelEditProgram} title="Edit Program">
        <form onSubmit={saveProgramEdit}>
          <div className="modal-form-grid">
            <div className="modal-form-group full-width">
              <label>Department</label>
              <select
                value={progEditDeptId}
                onChange={(e) => setProgEditDeptId(e.target.value)}
                required
              >
                <option value="">Select...</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>{d.code} - {d.name}</option>
                ))}
              </select>
            </div>
            <div className="modal-form-group full-width">
              <label>Program Name</label>
              <input
                value={progEditName}
                onChange={(e) => setProgEditName(e.target.value)}
                required
              />
            </div>
            <div className="modal-form-group full-width">
              <label>Program Code</label>
              <input
                value={progEditCode}
                onChange={(e) => setProgEditCode(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={cancelEditProgram}>Cancel</button>
            <button type="submit" className="modal-btn-primary" disabled={!progEditDeptId || !progEditName || !progEditCode}>Save Changes</button>
          </div>
        </form>
      </Modal>
      <Modal 
        open={!!toggleDeptData} 
        onClose={() => setToggleDeptData(null)} 
        title={toggleDeptData?.action === 'activate' ? 'Activate School' : 'Deactivate School'}
      >
        <div style={{ padding: '20px' }}>
          <p style={{ margin: '0 0 16px', color: '#444', lineHeight: '1.5' }}>
            Are you sure you want to <strong>{toggleDeptData?.action}</strong> the school 
            <span style={{ color: 'var(--primary-bg)', fontWeight: '600' }}> {toggleDeptData?.dept?.name}</span>?
          </p>
          {toggleDeptData?.action === 'deactivate' && (
            <p style={{ fontSize: '13px', color: '#888', background: '#fcf8f8', padding: '10px', borderRadius: '6px', borderLeft: '4px solid #dc2626' }}>
              <strong style={{ color: '#dc2626' }}>Warning:</strong> Deactivating a school will hide all its associated programs and prevent its faculty/students from accessing program-specific features.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={() => setToggleDeptData(null)}>Cancel</button>
          <button 
            className={toggleDeptData?.action === 'activate' ? "modal-btn-primary" : "modal-btn-danger"} 
            onClick={confirmToggleDepartment}
          >
            Confirm {toggleDeptData?.action === 'activate' ? 'Activation' : 'Deactivation'}
          </button>
        </div>
      </Modal>

      <Modal 
        open={!!toggleProgramData} 
        onClose={() => setToggleProgramData(null)} 
        title={toggleProgramData?.action === 'activate' ? 'Activate Program' : 'Deactivate Program'}
      >
        <div style={{ padding: '20px' }}>
          <p style={{ margin: '0 0 16px', color: '#444', lineHeight: '1.5' }}>
            Are you sure you want to <strong>{toggleProgramData?.action}</strong> the program 
            <span style={{ color: 'var(--primary-bg)', fontWeight: '600' }}> {toggleProgramData?.program?.name}</span>?
          </p>
          {toggleProgramData?.action === 'deactivate' && (
            <p style={{ fontSize: '13px', color: '#888', background: '#f8f9fc', padding: '10px', borderRadius: '6px', borderLeft: '4px solid #f5a623' }}>
              <strong>Note:</strong> Deactivating a program will hide it from students and professors during registration and question submission.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={() => setToggleProgramData(null)}>Cancel</button>
          <button 
            className={toggleProgramData?.action === 'activate' ? "modal-btn-primary" : "modal-btn-danger"} 
            onClick={confirmToggleProgram}
          >
            Confirm {toggleProgramData?.action === 'activate' ? 'Activation' : 'Deactivation'}
          </button>
        </div>
      </Modal>
    </main>
  );
}
