import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/ChairTags.css';
import '../styles/global.css';

const BASE = 'http://localhost:5000';

export default function ChairTags({ me }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editValues, setEditValues] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);

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

  async function handleDelete(tag) {
    if (!window.confirm(`Delete tag "${tag.name}"?`)) return;
    try {
      await apiAuth(`${BASE}/api/tags/${tag._id}`, { method: 'DELETE' });
      setTags((prev) => prev.filter((t) => t._id !== tag._id));
    } catch (err) {
      alert(err.message || 'Failed to delete tag.');
    }
  }

  return (
    <div className='mng-subjects-container'>
      <div>
        <header className='mng-subjects-header'>
          <h1>Manage Subjects</h1>
          <p>Create and manage subjects for your program. Professors will use these subjects to categorize their questions.</p>
        </header>

        <div className='mng-subjects-content'>
          <header className='mng-subjects-content-header'>
            <h2>
              All Tags <div className='tag-count-pill'><span className="tag-count">{tags.length}</span></div>
            </h2>

            <button className="adminCatalog-btn" onClick={() => setShowAddModal(true)}>
              + Add New Tag
            </button>
          </header>

          {loading ? (
            <p>Loading…</p>
          ) : tags.length === 0 ? (
            <p>No tags yet. Create your first tag above.</p>
          ) : (
            <table className="tags-table">
              <colgroup>
                <col style={{ width: '40%' }} />
                <col style={{ width: '60%' }} />
              </colgroup>

              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {tags.map((tag) => {
                  const isEditing = tag._id in editValues;

                  return (
                    <tr key={tag._id}>
                      <td>
                        <div className="tag-pill editable">
                          {isEditing ? (
                            <input
                              className="tag-pill-input"
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
                            <span className="tag-pill-text">{tag.name}</span>
                          )}
                        </div>
                      </td>

                      <td>
                        <div className="adminCatalog-dept-actions">
                          <button className="adminCatalog-btn-edit" onClick={() => startEdit(tag)}>Edit</button>

                          <button className="adminCatalog-btn-danger" onClick={() => handleDelete(tag)}>Delete</button>
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAddModal && (
        <div
          className="adminCatalog-modal-overlay"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="adminCatalog-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="adminCatalog-modal-header">
              <h3>Add New Tag</h3>
              <button onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <form onSubmit={handleAdd}>
              <div className="adminCatalog-modal-body">
                <div className="adminCatalog-form-group">
                  <label className="form-title">Tag Name</label>
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
                  />
                </div>

                {addError && (
                  <p style={{ color: 'red', fontSize: '13px' }}>
                    {addError}
                  </p>
                )}
              </div>

              <div className="adminCatalog-modal-footer">
                <button
                  type="button"
                  className="adminCatalog-cancelbtn"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="adminCatalog-primarybtn"
                  disabled={saving}
                >
                  {saving ? 'Adding…' : 'Add Tag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
