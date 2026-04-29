import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import { Modal } from '../components/Modal.jsx';
import '../styles/SubjectTags.css';
import '../styles/global.css';

const BASE = 'http://localhost:5000';

export default function ChairTags({ me }) {
  const isDean = me?.role === 'dean';
  const [tags, setTags] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [programId, setProgramId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editValues, setEditValues] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [tagToDelete, setTagToDelete] = useState(null);

  async function fetchPrograms() {
    if (!isDean) return;
    setLoadingPrograms(true);
    try {
      const data = await apiAuth(`${BASE}/api/catalog/programs`);
      const deptId = me?.department?._id || me?.department;
      const deptPrograms = (data.programs || []).filter((program) => {
        const programDept = program.department?._id || program.department;
        return String(programDept) === String(deptId);
      });
      setPrograms(deptPrograms);
      setProgramId((prev) => {
        if (prev && deptPrograms.some((program) => String(program._id) === String(prev))) return prev;
        if (deptPrograms.length === 1) return deptPrograms[0]._id;
        return '';
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPrograms(false);
    }
  }

  async function fetchTags() {
    if (isDean && !programId) {
      setTags([]);
      setLoading(false);
      return;
    }
    try {
      const path = isDean ? `${BASE}/api/tags?program=${encodeURIComponent(programId)}` : `${BASE}/api/tags`;
      const data = await apiAuth(path);
      setTags(data.tags || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPrograms();
  }, [isDean, me]);

  useEffect(() => {
    setLoading(true);
    fetchTags();
  }, [isDean, programId]);

  async function handleAdd(e) {
    e.preventDefault();
    setAddError('');
    if (!newName.trim()) { setAddError('Tag name cannot be empty.'); return; }
    if (isDean && !programId) { setAddError('Select a program first.'); return; }
    setSaving(true);
    try {
      const body = isDean ? { name: newName.trim(), programId } : { name: newName.trim() };
      const data = await apiAuth(`${BASE}/api/tags`, { method: 'POST', body });
      setTags((prev) => [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setShowAddModal(false);
    } catch (err) {
      setAddError(err.message || 'Failed to create tag.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(tag) {
    setEditValues((prev) => ({ ...prev, [tag._id]: tag.name }));
  }

  function cancelEdit(id) {
    setEditValues((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  async function saveEdit(tag) {
    const name = editValues[tag._id];
    if (!name?.trim()) return;
    try {
      const data = await apiAuth(`${BASE}/api/tags/${tag._id}`, { method: 'PATCH', body: { name: name.trim() } });
      setTags((prev) => prev.map((t) => (t._id === tag._id ? data.tag : t)).sort((a, b) => a.name.localeCompare(b.name)));
      cancelEdit(tag._id);
    } catch (err) {
      alert(err.message || 'Failed to update tag.');
    }
  }

  function handleDelete(tag) {
    setTagToDelete(tag);
    setShowDeleteModal(true);
  }

  async function confirmDelete() {
    if (!tagToDelete) return;
    setSaving(true);
    try {
      await apiAuth(`${BASE}/api/tags/${tagToDelete._id}`, { method: 'DELETE' });
      setTags((prev) => prev.filter((t) => t._id !== tagToDelete._id));
      setShowDeleteModal(false);
      setTagToDelete(null);
    } catch (err) {
      alert(err.message || 'Failed to delete tag.');
    } finally {
      setSaving(false);
    }
  }

  const filteredTags = tags.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const departmentLabel = me?.department?.name || 'Department';

  return (
    <main className="qp-page ct-page">
      <header className="qp-page-header">
        <div className="qp-header">
          <div>
            <h1 className="qp-title">Manage Subjects</h1>
            <p className="qp-subtitle">
              {isDean
                ? 'Create and manage subjects for programs under your department. Professors will use these subjects to categorize their questions.'
                : 'Create and manage subjects for your program. Professors will use these subjects to categorize their questions.'}
            </p>
          </div>

          <button type="button" className="qp-btn-add" onClick={() => setShowAddModal(true)} disabled={isDean && !programId}>
            + Add New Subject
          </button>
        </div>
      </header>

      <div className="ct-controls-row">
        <div className="qp-state-pill qp-state-pill--active">
          <span className="qp-state-pill-count">{filteredTags.length}</span>
          <span>{searchQuery ? 'Matches' : 'All Subjects'}</span>
        </div>
        {isDean ? (
          <div className="st-dean-toolbar">
            <select
              className="st-dean-program-select"
              value={programId}
              onChange={(e) => {
                setProgramId(e.target.value);
                setEditValues({});
                setSearchQuery('');
              }}
              disabled={loadingPrograms}
            >
              <option value="">{`Select ${departmentLabel} Program`}</option>
              {programs.map((program) => (
                <option key={program._id} value={program._id}>
                  {program.name} {program.code ? `(${program.code})` : ''}
                </option>
              ))}
            </select>

            <input
              className="qp-search st-dean-search"
              type="text"
              placeholder="Search subjects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={!programId}
            />
          </div>
        ) : (
          <input
            className="qp-search"
            type="text"
            placeholder="Search subjects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        )}
      </div>

      {isDean && !programId ? (
        <p className="ct-helper-note">Select a program first before managing subjects.</p>
      ) : null}

      <div className="qp-table-wrap">
        {loading ? (
          <p className="qp-loading">Loading subjects...</p>
        ) : (
          <table className="qp-table">
            <thead>
              <tr>
                <th style={{ width: '70%' }}>Subject Name</th>
                <th style={{ width: '30%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTags.length === 0 ? (
                <tr>
                  <td colSpan="2" className="qp-empty">
                    {searchQuery ? `No subjects match "${searchQuery}"` : 'No subjects found. Create your first one!'}
                  </td>
                </tr>
              ) : (
                filteredTags.map((tag) => {
                  const isEditing = tag._id in editValues;
                  return (
                    <tr key={tag._id}>
                      <td>
                        {isEditing ? (
                          <input
                            className="ct-inline-edit"
                            value={editValues[tag._id]}
                            autoFocus
                            onChange={(e) =>
                              setEditValues((prev) => ({
                                ...prev,
                                [tag._id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(tag);
                              if (e.key === 'Escape') cancelEdit(tag._id);
                            }}
                          />
                        ) : (
                          <span className="qp-badge qp-badge--subject">{tag.name}</span>
                        )}
                      </td>

                      <td className="qp-actions-cell">
                        {isEditing ? (
                          <>
                            <button className="qp-btn-submit" onClick={() => saveEdit(tag)}>Save</button>
                            <button className="qp-btn-edit" onClick={() => cancelEdit(tag._id)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="qp-btn-edit" onClick={() => startEdit(tag)}>Edit</button>
                            <button className="qp-btn-delete" onClick={() => handleDelete(tag)}>Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Subject"
      >
        <div className="qp-modal-copy">
          <p className="qp-modal-subtitle">
            {isDean
              ? 'Create a new subject category for the selected program.'
              : 'Create a new subject category for your program\'s questions.'}
          </p>
        </div>

        <form onSubmit={handleAdd} className="ct-modal-form">
          {isDean ? (
            <div className="adminCatalog-form-group">
              <label className="form-title">Program *</label>
              <select
                className="st-dean-modal-select"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                required
              >
                <option value="">{`Select ${departmentLabel} Program`}</option>
                {programs.map((program) => (
                  <option key={program._id} value={program._id}>
                    {program.name} {program.code ? `(${program.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="adminCatalog-form-group">
            <label className="form-title">Subject Name *</label>
            <input
              type="text"
              placeholder="e.g. Mathematics"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setAddError('');
              }}
              maxLength={60}
              autoFocus
              required
            />
          </div>

          {addError && <p className="error-text">{addError}</p>}

          <div className="modal-actions ct-modal-actions">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modal-btn-primary"
              disabled={saving || (isDean && !programId)}
            >
              {saving ? 'Adding...' : 'Add Subject'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Subject"
      >
        <div className="qp-modal-copy">
          <p className="qp-modal-subtitle">
            Are you sure you want to delete the subject <strong>"{tagToDelete?.name}"</strong>?
          </p>
          <p className="qp-modal-subtitle qp-warning-text">
            This action cannot be undone and may affect questions categorized under this subject.
          </p>
        </div>

        <div className="modal-actions ct-modal-actions">
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={() => setShowDeleteModal(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn-danger"
            onClick={confirmDelete}
            disabled={saving}
          >
            {saving ? 'Deleting...' : 'Delete Subject'}
          </button>
        </div>
      </Modal>
    </main>
  );
}
