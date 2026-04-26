import { useRef, useState } from 'react';
import { apiAuth, apiAuthUpload } from '../lib/api.js';
import '../styles/QuestionForm.css';

const BASE = 'http://localhost:5000';

export default function QuestionForm({ tags, programId, initialData, onSaved, onClose, readOnly = false }) {
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
      existing: true,
    }))
  );
  const [uploadedUrls, setUploadedUrls] = useState(initialData?.images || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const fileRef = useRef();

  function addAnswer() {
    if (readOnly) return;
    setAnswers((prev) => [...prev, { text: '', isCorrect: false }]);
  }

  function removeAnswer(idx) {
    if (readOnly || answers.length <= 2) return;
    const next = answers.filter((_, i) => i !== idx);
    if (!next.some((a) => a.isCorrect)) next[0].isCorrect = true;
    setAnswers(next);
  }

  function setCorrect(idx) {
    if (readOnly) return;
    setAnswers((prev) => prev.map((a, i) => ({ ...a, isCorrect: i === idx })));
  }

  function setAnswerText(idx, text) {
    if (readOnly) return;
    setAnswers((prev) => prev.map((a, i) => (i === idx ? { ...a, text } : a)));
  }

  async function handleImagePick(e) {
    if (readOnly) return;
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const previews = files.map((file) => ({ url: URL.createObjectURL(file), file, existing: false }));
    setImagePreviews((prev) => [...prev, ...previews]);
    setUploading(true);

    try {
      const fd = new FormData();
      files.forEach((file) => fd.append('images', file));
      const data = await apiAuthUpload(`${BASE}/api/questions/upload-image`, fd);
      setUploadedUrls((prev) => [...prev, ...data.urls]);
    } catch (err) {
      setError(`Image upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function removeImage(idx) {
    if (readOnly) return;
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
    if (readOnly) return;
    const err = validate();
    if (err) {
      setError(err);
      return;
    }

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
    <div className={`qf-shell ${readOnly ? 'qf-shell--readonly' : ''}`}>
      <div className="qf-grid">
        <div className="qf-field">
          <label htmlFor="question-title">Question Title *</label>
          <input
            id="question-title"
            type="text"
            placeholder="e.g. Beam Deflection Problem #1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            disabled={readOnly}
          />
        </div>

        <div className="qf-field">
          <label htmlFor="question-subject">Subject *</label>
          <select id="question-subject" value={tagId} onChange={(e) => setTagId(e.target.value)} disabled={readOnly}>
            <option value="">Select a subject</option>
            {tags.map((tag) => (
              <option key={tag._id} value={tag._id}>{tag.name}</option>
            ))}
          </select>
          {tags.length === 0 && !readOnly ? (
            <p className="qf-inline-note qf-inline-note--error">
              No subjects available. Ask your Program Chair to create subjects first.
            </p>
          ) : null}
        </div>

        <div className="qf-field qf-field--full">
          <label htmlFor="question-description">Question *</label>
          <textarea
            id="question-description"
            placeholder="Write the full question here..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            disabled={readOnly}
          />
        </div>
      </div>

      <section className="qf-section">
        <div className="qf-section-heading">
          <div>
            <h3>Answers *</h3>
            <p>{readOnly ? 'The correct answer is marked with a selected radio button.' : 'Select the radio button to mark the correct answer.'}</p>
          </div>
          {!readOnly && (
            <button type="button" className="qf-secondary-btn" onClick={addAnswer}>
              + Add Answer
            </button>
          )}
        </div>

        <div className="qf-answer-list">
          {answers.map((answer, idx) => (
            <div key={idx} className="qf-answer-row">
              <label className={`qf-answer-radio ${readOnly ? 'is-disabled' : ''}`}>
                <input
                  type="radio"
                  checked={answer.isCorrect}
                  onChange={() => setCorrect(idx)}
                  title="Mark as correct"
                  disabled={readOnly}
                />
                <span className="qf-radio-indicator" />
              </label>

              <input
                className="qf-answer-input"
                type="text"
                placeholder={`Answer ${idx + 1}`}
                value={answer.text}
                onChange={(e) => setAnswerText(idx, e.target.value)}
                disabled={readOnly}
              />

              {answers.length > 2 && !readOnly ? (
                <button type="button" className="qf-remove-btn" onClick={() => removeAnswer(idx)}>
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="qf-section">
        <div className="qf-section-heading">
          <div>
            <h3>Images</h3>
            <p>{readOnly ? 'Images attached to this question.' : 'Optional, maximum of 5 images.'}</p>
          </div>
        </div>

        {!readOnly && (
          <div className="qf-upload-box">
            <input
              ref={fileRef}
              className="qf-file-input"
              type="file"
              multiple
              accept="image/*"
              onChange={handleImagePick}
            />
            <button type="button" className="qf-secondary-btn" onClick={() => fileRef.current?.click()}>
              Choose Files
            </button>
            <span className="qf-upload-note">
              {uploading ? 'Uploading images...' : 'PNG, JPG, or WEBP files work best.'}
            </span>
          </div>
        )}

        {imagePreviews.length > 0 ? (
          <div className="image-previews">
            {imagePreviews.map((img, idx) => (
              <div key={idx} className="image-thumb">
                <img
                  src={img.url}
                  alt=""
                  onClick={() => setFullscreenImage(img.url)}
                  title="Click to view full size"
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="btn-remove-img"
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : !readOnly || imagePreviews.length > 0 ? null : (
          <p className="qf-inline-note">No images attached.</p>
        )}
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="form-actions">
        <button type="button" className="modal-btn-cancel" onClick={onClose} disabled={saving}>
          {readOnly ? 'Close' : 'Cancel'}
        </button>
        {!readOnly && (
          <>
            <button
              type="button"
              className="qf-draft-btn"
              onClick={() => save(false)}
              disabled={saving || uploading}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              type="button"
              className="qf-submit-btn"
              onClick={() => save(true)}
              disabled={saving || uploading}
            >
              {saving ? 'Saving...' : 'Submit for Review'}
            </button>
          </>
        )}
      </div>

      {fullscreenImage ? (
        <div className="fullscreen-overlay">
          <div className="fullscreen-content">
            <button
              type="button"
              onClick={() => setFullscreenImage(null)}
              className="btn-close-red"
            >
              Close
            </button>
            <img src={fullscreenImage} alt="Fullscreen" className="fullscreen-img" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
