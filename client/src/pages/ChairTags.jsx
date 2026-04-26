import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import { Modal } from '../components/Modal.jsx';
import '../styles/ChairTags.css';
import '../styles/global.css';

const BASE = 'http://localhost:5000';

export default function ChairTags({ me }) {
  const [tags, setTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editValues, setEditValues] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [tagToDelete, setTagToDelete] = useState(null);

  async function fetchTags() {
    try {
      const data = await apiAuth(`${BASE}/api/tags`);
      setTags(data.tags || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTags(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setAddError('');
    if (!newName.trim()) { setAddError('Tag name cannot be empty.'); return; }
    setSaving(true);
    try {
      const data = await apiAuth(`${BASE}/api/tags`, { method: 'POST', body: { name: newName.trim() } });
      setTags((prev) => [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
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

  return (
    <main className="qp-page ct-page">
      <header className="qp-page-header">
        <div className="qp-header">
          <div>
            <h1 className="qp-title">Manage Subjects</h1>
            <p className="qp-subtitle">Create and manage subjects for your program. Professors will use these subjects to categorize their questions.</p>
          </div>

          <button type="button" className="qp-btn-add" onClick={() => setShowAddModal(true)}>
            + Add New Subject
          </button>
        </div>
      </header>

      <div className="ct-controls-row">
        <div className="qp-state-pill qp-state-pill--active">
          <span className="qp-state-pill-count">{filteredTags.length}</span>
          <span>{searchQuery ? 'Matches' : 'All Subjects'}</span>
        </div>

        <input
          className="qp-search"
          type="text"
          placeholder="Search subjects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

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
            Create a new subject category for your program's questions.
          </p>
        </div>

        <form onSubmit={handleAdd} className="ct-modal-form">
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
              disabled={saving}
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
