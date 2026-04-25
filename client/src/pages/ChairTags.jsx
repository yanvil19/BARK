import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';

const BASE = 'http://localhost:5000';

export default function ChairTags({ me }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editValues, setEditValues] = useState({});

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
    <div>
      <h1>Manage Subjects</h1>
      <p>Create and manage subjects for your program. Professors will use these subjects to categorize their questions.</p>

      <hr />

      <h2>Add New Tag</h2>
      <form onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="e.g. Mathematics"
          value={newName}
          onChange={(e) => { setNewName(e.target.value); setAddError(''); }}
          maxLength={60}
        />
        <button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add Tag'}</button>
        {addError && <p style={{ color: 'red' }}>{addError}</p>}
      </form>

      <hr />

      <h2>All Tags ({tags.length})</h2>
      {loading ? (
        <p>Loading…</p>
      ) : tags.length === 0 ? (
        <p>No tags yet. Create your first tag above.</p>
      ) : (
        <ul>
          {tags.map((tag) => {
            const isEditing = tag._id in editValues;
            return (
              <li key={tag._id}>
                {isEditing ? (
                  <>
                    <input
                      value={editValues[tag._id]}
                      autoFocus
                      onChange={(e) => setEditValues((prev) => ({ ...prev, [tag._id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(tag);
                        if (e.key === 'Escape') cancelEdit(tag._id);
                      }}
                    />
                    <button onClick={() => saveEdit(tag)}>Save</button>
                    <button onClick={() => cancelEdit(tag._id)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <strong>{tag.name}</strong>
                    {' '}
                    <button onClick={() => startEdit(tag)}>Edit</button>
                    <button onClick={() => handleDelete(tag)}>Delete</button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
