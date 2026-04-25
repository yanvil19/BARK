import { useState, useRef } from 'react';
import { apiAuth, apiAuthUpload } from '../lib/api.js';
import '../styles/QuestionForm.css';

const BASE = 'http://localhost:5000';

export default function QuestionForm({ tags, programId, initialData, onSaved, onClose }) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [answers, setAnswers] = useState(initialData?.answers || [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
  ]);
  const [tagId, setTagId] = useState(initialData?.tag?._id || initialData?.tag || '');
  const [imagePreviews, setImagePreviews] = useState(
    (initialData?.images || []).map((url) => ({ 
      url: url.startsWith('/') ? `${BASE}${url}` : url, 
      file: null, 
      existing: true 
    }))
  );
  const [uploadedUrls, setUploadedUrls] = useState(initialData?.images || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const fileRef = useRef();

  function addAnswer() {
    setAnswers((prev) => [...prev, { text: '', isCorrect: false }]);
  }

  function removeAnswer(idx) {
    if (answers.length <= 2) return;
    const next = answers.filter((_, i) => i !== idx);
    if (!next.some((a) => a.isCorrect)) next[0].isCorrect = true;
    setAnswers(next);
  }

  function setCorrect(idx) {
    setAnswers((prev) => prev.map((a, i) => ({ ...a, isCorrect: i === idx })));
  }

  function setAnswerText(idx, text) {
    setAnswers((prev) => prev.map((a, i) => (i === idx ? { ...a, text } : a)));
  }

  async function handleImagePick(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const previews = files.map((f) => ({ url: URL.createObjectURL(f), file: f, existing: false }));
    setImagePreviews((prev) => [...prev, ...previews]);
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      const data = await apiAuthUpload(`${BASE}/api/questions/upload-image`, fd);
      setUploadedUrls((prev) => [...prev, ...data.urls]);
    } catch (err) {
      setError('Image upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function removeImage(idx) {
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx));
    setUploadedUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  function validate() {
    if (!title.trim()) return 'Question title is required.';
    if (!description.trim()) return 'Question description is required.';
    if (!tagId) return 'Please select a subject.';
    if (answers.some((a) => !a.text.trim())) return 'All answer fields must be filled in.';
    if (!answers.some((a) => a.isCorrect)) return 'Mark one answer as correct.';
    return '';
  }

  async function save(submit = false) {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        answers,
        tagId,
        images: uploadedUrls,
        ...(programId ? { programId } : {}),
      };
      
      let question;
      if (initialData) {
        const data = await apiAuth(`${BASE}/api/questions/${initialData._id}`, { method: 'PATCH', body });
        question = data.question;
      } else {
        const data = await apiAuth(`${BASE}/api/questions`, { method: 'POST', body });
        question = data.question;
      }
      
      if (submit) {
        await apiAuth(`${BASE}/api/questions/${question._id}/submit`, { method: 'POST' });
        onSaved({ ...question, state: 'pending_chair' }, !!initialData);
      } else {
        onSaved(question, !!initialData);
      }
    } catch (err) {
      setError(err.message || 'Failed to save question.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Title */}
      <div>
        <label><strong>Question Title *</strong></label><br />
        <input
          type="text"
          placeholder="e.g. Beam Deflection Problem #1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
      </div>

      <br />

      {/* Description */}
      <div>
        <label><strong>Question *</strong></label><br />
        <textarea
          placeholder="Write the full question here…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          cols={50}
        />
      </div>

      <br />

      {/* Subject */}
      <div>
        <label><strong>Subject *</strong></label><br />
        <select value={tagId} onChange={(e) => setTagId(e.target.value)} className="qf-select">
          <option value="">— Select a subject —</option>
          {tags.map((t) => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </select>
        {tags.length === 0 && (
          <p className="error-text">No subjects available. Ask your Program Chair to create subjects first.</p>
        )}
      </div>

      <br />

      {/* Answers */}
      <div>
        <label><strong>Answers *</strong> (select the radio button to mark the correct answer)</label>
        <br />
        {answers.map((ans, idx) => (
          <div key={idx} className="answer-row">
            <input
              type="radio"
              checked={ans.isCorrect}
              onChange={() => setCorrect(idx)}
              title="Mark as correct"
            />
            <input
              type="text"
              placeholder={`Answer ${idx + 1}`}
              value={ans.text}
              onChange={(e) => setAnswerText(idx, e.target.value)}
            />
            {answers.length > 2 && (
              <button type="button" onClick={() => removeAnswer(idx)}>Remove</button>
            )}
          </div>
        ))}
        <br />
        <button type="button" onClick={addAnswer}>+ Add Answer</button>
      </div>

      <br />

      {/* Images */}
      <div>
        <label><strong>Images</strong> (optional, max 5)</label><br />
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleImagePick}
        />
        {uploading && <span> Uploading…</span>}
        {imagePreviews.length > 0 && (
          <div className="image-previews">
            {imagePreviews.map((img, idx) => (
              <div key={idx} className="image-thumb">
                <img 
                  src={img.url} 
                  alt="" 
                  onClick={() => setFullscreenImage(img.url)}
                  title="Click to view full size"
                />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="btn-remove-img"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <br />

      {error && <p className="error-text">{error}</p>}

      {/* Actions */}
      <div className="form-actions">
        <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" onClick={() => save(false)} disabled={saving || uploading}>
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        <button type="button" onClick={() => save(true)} disabled={saving || uploading}>
          {saving ? 'Saving…' : 'Submit for Review'}
        </button>
      </div>

      {/* Fullscreen Image Viewer */}
      {fullscreenImage && (
        <div className="fullscreen-overlay">
          <div className="fullscreen-content">
            <button 
              type="button"
              onClick={() => setFullscreenImage(null)}
              className="btn-close-red"
            >✕ Close</button>
            <img src={fullscreenImage} alt="Fullscreen" className="fullscreen-img" />
          </div>
        </div>
      )}
    </div>
  );
}
