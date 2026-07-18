import { useEffect, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/superadmin/SAdminUsers.css';
import { Modal } from '../../components/Modal.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import PageHeader from '../../components/PageHeader.jsx';

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
  const [deleteMode, setDeleteMode] = useState(false);
  const [hoveredDeleteKey, setHoveredDeleteKey] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'department' | 'program', item }
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
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

  function startDelete(type, item) {
    setDeleteError('');
    setDeleteTarget({ type, item });
  }

  function closeDeleteModal() {
    setDeleteTarget(null);
    setDeleteError('');
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    const { type, item } = deleteTarget;
    const basePath = type === 'department' ? '/api/admin/catalog/departments' : '/api/admin/catalog/programs';

    setDeleteBusy(true);
    setDeleteError('');
    try {
      await apiAuth(`${basePath}/${encodeURIComponent(item._id)}`, { method: 'DELETE' });
      await loadDepartments();
      await loadPrograms();
      closeDeleteModal();
      if (type === 'department' && deptEditId === item._id) cancelEditDepartment();
      if (type === 'program' && progEditId === item._id) cancelEditProgram();
    } catch (err) {
      setDeleteError(err.message || `Delete ${type} failed`);
    } finally {
      setDeleteBusy(false);
    }
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
      <PageHeader
        className="shared-page-header--bleed"
        title="Schools and Program"
        subtitle="Manage system-wide departments and programs"
      >
        <button
          type="button"
          className={`um-btn-delete-mode ${deleteMode ? 'um-btn-delete-mode--active' : ''}`}
          onClick={() => setDeleteMode((value) => !value)}
        >
          {deleteMode ? 'Exit Delete Mode' : 'Delete Mode'}
        </button>
        <button className="um-btn-add" onClick={() => setShowForm(true)}>
          + Add School
        </button>
        <button className="um-btn-add" style={{ background: '#f0f2f8', color: 'var(--primary-bg)', border: '1px solid #d0d5dd' }} onClick={() => setShowProgramForm(true)}>
          + Add Program
        </button>
      </PageHeader>

      {error ? <p className="um-error" style={{ margin: '0 20px 16px' }}>{error}</p> : null}

      <div style={{ padding: '0 20px' }}>
        {/* ── Departments Table ── */}
        <section className="um-table-wrap">
          <div className="table-section-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e4e7ec', background: '#fafbff' }}>
            <h3 className="um-user-name" style={{ fontSize: '16px' }}>Schools of NU Laguna</h3>
          </div>
          <div className="scroll-x">
            <table className="um-table um-table-depts">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>Acronym</th>
                <th style={{ width: '250px' }}>School Name</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Programs</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Status</th>
                <th style={{ width: '200px', textAlign: 'center' }}>Actions</th>
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
                    <tr key={d._id} className={hoveredDeleteKey === `department-${d._id}` ? 'um-row-delete-hover' : ''}>
                      <td><span className="um-badge um-badge--dept">{d.code}</span></td>
                      <td style={{ fontWeight: '600', maxWidth: '220px', wordBreak: 'break-word', whiteSpace: 'normal'}}>{d.name}</td>
                      <td style={{ textAlign: 'center', color: '#666' }}>{programCount}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`um-status ${d.isActive ? 'um-status--active' : 'um-status--inactive'}`}>
                          ● {d.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="um-actions-cell">
                          <button className="um-btn-edit" onClick={() => startEditDepartment(d)}>Edit</button>
                          <button 
                            className={d.isActive ? "um-btn-deactivate" : "um-btn-activate"} 
                            onClick={() => handleToggleDepartment(d)}
                          >
                            {d.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          {deleteMode ? (
                            <button
                              type="button"
                              className="um-btn-delete-icon"
                              onClick={() => startDelete('department', d)}
                              onMouseEnter={() => setHoveredDeleteKey(`department-${d._id}`)}
                              onMouseLeave={() => setHoveredDeleteKey((current) => (current === `department-${d._id}` ? null : current))}
                              aria-label={`Delete ${d.name}`}
                              title="Delete school"
                            >
                              <TrashIcon className="um-delete-icon" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
          
        </section>

        {/* ── Programs Section ── */}
        <section className="um-table-wrap">
          <div className="table-section-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e4e7ec', background: '#fafbff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="um-user-name" style={{ fontSize: '16px' }}>Academic Programs</h3>
            <div className="um-filters" style={{ marginBottom: 0 }}>
              <select
                className="um-filter-select"
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
          <div className="scroll-x">
            <table className="um-table um-table-programs">
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Code</th>
                <th style={{ width: '250px' }}>Program Name</th>
                <th style={{ width: '150px' }}>Department</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Status</th>
                <th style={{ width: '200px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {programs.length === 0 ? (
                <tr><td colSpan="5" className="um-empty">No programs found.</td></tr>
              ) : (
                programs.map((p) => (
                  <tr key={p._id} className={hoveredDeleteKey === `program-${p._id}` ? 'um-row-delete-hover' : ''}>
                    <td><span className="um-badge um-badge--dept">{p.code}</span></td>
                    <td style={{ fontWeight: '600' }}>{p.name}</td>
                    <td><span className="um-badge um-badge--dept" style={{ background: '#f0f2f8', color: '#555', border: '1px solid #d0d5dd' }}>{p.department?.code || p.department}</span></td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`um-status ${p.isActive ? 'um-status--active' : 'um-status--inactive'}`}>
                        ● {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="um-actions-cell">
                        <button className="um-btn-edit" onClick={() => startEditProgram(p)}>Edit</button>
                        <button 
                          className={p.isActive ? "um-btn-deactivate" : "um-btn-activate"} 
                          onClick={() => handleToggleProgram(p)}
                        >
                          {p.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        {deleteMode ? (
                          <button
                            type="button"
                            className="um-btn-delete-icon"
                            onClick={() => startDelete('program', p)}
                            onMouseEnter={() => setHoveredDeleteKey(`program-${p._id}`)}
                            onMouseLeave={() => setHoveredDeleteKey((current) => (current === `program-${p._id}` ? null : current))}
                            aria-label={`Delete ${p.name}`}
                            title="Delete program"
                          >
                            <TrashIcon className="um-delete-icon" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
         
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
      <ConfirmationModal
        open={!!toggleDeptData}
        onClose={() => setToggleDeptData(null)}
        onConfirm={confirmToggleDepartment}
        title={toggleDeptData?.action === 'activate' ? 'Activate School' : 'Deactivate School'}
        message={(
          <p style={{ margin: 0 }}>
            Are you sure you want to <strong>{toggleDeptData?.action}</strong> the school
            <span style={{ color: 'var(--primary-bg)', fontWeight: '600' }}> {toggleDeptData?.dept?.name}</span>?
          </p>
        )}
        confirmLabel={toggleDeptData?.action === 'activate' ? 'Activate School' : 'Deactivate School'}
        confirmVariant={toggleDeptData?.action === 'activate' ? 'primary' : 'danger'}
      >
        {toggleDeptData?.action === 'deactivate' && (
          <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#888' }}>
            <strong style={{ color: '#dc2626' }}>Warning:</strong> Deactivating a school will hide all its associated programs and prevent its faculty/students from accessing program-specific features.
          </p>
        )}
      </ConfirmationModal>

      <ConfirmationModal
        open={!!toggleProgramData}
        onClose={() => setToggleProgramData(null)}
        onConfirm={confirmToggleProgram}
        title={toggleProgramData?.action === 'activate' ? 'Activate Program' : 'Deactivate Program'}
        message={(
          <p style={{ margin: 0 }}>
            Are you sure you want to <strong>{toggleProgramData?.action}</strong> the program
            <span style={{ color: 'var(--primary-bg)', fontWeight: '600' }}> {toggleProgramData?.program?.name}</span>?
          </p>
        )}
        confirmLabel={toggleProgramData?.action === 'activate' ? 'Activate Program' : 'Deactivate Program'}
        confirmVariant={toggleProgramData?.action === 'activate' ? 'primary' : 'danger'}
      >
        {toggleProgramData?.action === 'deactivate' && (
          <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#666' }}>
            <strong>Note:</strong> Deactivating a program will hide it from students and professors during registration and question submission.
          </p>
        )}
      </ConfirmationModal>

      <ConfirmationModal
        open={!!deleteTarget}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        title={deleteTarget?.type === 'department' ? 'Delete School' : 'Delete Program'}
        message={(
          <p style={{ margin: 0 }}>
            This will permanently delete <strong>{deleteTarget?.item?.name}</strong> from the system.
          </p>
        )}
        confirmLabel={deleteTarget?.type === 'department' ? 'Delete School' : 'Delete Program'}
        confirmVariant="danger"
        busy={deleteBusy}
        error={deleteError}
      >
        <p style={{ margin: '12px 0 0', color: '#666' }}>This action cannot be undone.</p>
      </ConfirmationModal>
    </main>
  );
}
