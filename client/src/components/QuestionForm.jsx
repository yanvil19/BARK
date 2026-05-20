import { useState } from 'react';
import { apiAuth, apiAuthUpload } from '../lib/api.js';
import '../styles/QuestionForm.css';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substring(2);
}

export default function QuestionForm({ tags, programId, initialData, onSaved, onClose, readOnly = false, importedQuestions = [] }) {
    const [questionsData, setQuestionsData] = useState(() => {
    // If imported questions are provided, pre-fill all of them
    if (importedQuestions && importedQuestions.length > 0) {
      return importedQuestions.map(q => ({
        id: generateId(),
        title: q.question_title || q.title || '',
        description: q.description || '',
        answers: q.answers?.length >= 2 ? q.answers : [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
        ],
        tagId: q.tagId || '',
        imagePreviews: [],
        uploadedUrls: [],
        uploading: false,
        aiFlags: q.flags || [], // Store original AI flags separately
      }));
    }

    // Default — single empty form or edit form
    return [{
      id: generateId(),
      title: initialData?.title || '',
      description: initialData?.description || '',
      answers: initialData?.answers || [
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
      ],
      tagId: initialData?.tag?._id || initialData?.tag || '',
      imagePreviews: (initialData?.images || []).map((url) => ({
        url: url.startsWith('/') ? `${BASE}${url}` : url,
        file: null,
        existing: true,
      })),
      uploadedUrls: initialData?.images || [],
      uploading: false,
      aiFlags: [],
    }];
  });
  const [saving, setSaving] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(null);

  function updateQuestion(qId, updater) {
    setQuestionsData(prev => prev.map(q => q.id === qId ? updater(q) : q));
  }

  function addAnswer(qId) {
    if (readOnly) return;
    updateQuestion(qId, q => ({ ...q, answers: [...q.answers, { text: '', isCorrect: false }] }));
  }

  function removeAnswer(qId, idx) {
    if (readOnly) return;
    updateQuestion(qId, q => {
      if (q.answers.length <= 2) return q;
      const next = q.answers.filter((_, i) => i !== idx);
      if (!next.some((a) => a.isCorrect)) next[0].isCorrect = true;
      return { ...q, answers: next };
    });
  }

  function setCorrect(qId, idx) {
    if (readOnly) return;
    updateQuestion(qId, q => ({ ...q, answers: q.answers.map((a, i) => ({ ...a, isCorrect: i === idx })) }));
  }

  function setAnswerText(qId, idx, text) {
    if (readOnly) return;
    updateQuestion(qId, q => ({ ...q, answers: q.answers.map((a, i) => (i === idx ? { ...a, text } : a)) }));
  }

  async function handleImagePick(e, qId) {
    if (readOnly) return;
    const files = Array.from(e.target.files);
    if (!files.length) return;

    let targetQ = questionsData.find(q => q.id === qId);
    if (!targetQ) return;

    if (targetQ.imagePreviews.length + files.length > 5) {
      updateQuestion(qId, q => ({ ...q, error: 'Maximum of 5 images allowed per question.' }));
      e.target.value = '';
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        updateQuestion(qId, q => ({ ...q, error: `File "${file.name}" is not an allowed type. Only JPG, PNG, and WEBP are accepted.` }));
        e.target.value = '';
        return;
      }
      if (file.size > MAX_SIZE) {
        updateQuestion(qId, q => ({ ...q, error: `File "${file.name}" exceeds the 5MB size limit.` }));
        e.target.value = '';
        return;
      }
    }

    const previews = files.map((file) => ({ url: URL.createObjectURL(file), file, existing: false }));
    updateQuestion(qId, q => ({ ...q, imagePreviews: [...q.imagePreviews, ...previews], uploading: true, error: '' }));

    try {
      const fd = new FormData();
      files.forEach((file) => fd.append('images', file));
      const data = await apiAuthUpload(`${BASE}/api/questions/upload-image`, fd);
      updateQuestion(qId, q => ({ ...q, uploadedUrls: [...q.uploadedUrls, ...data.urls], uploading: false }));
    } catch (err) {
      updateQuestion(qId, q => ({
        ...q,
        error: `Image upload failed: ${err.message}`,
        imagePreviews: q.imagePreviews.slice(0, q.imagePreviews.length - previews.length),
        uploading: false
      }));
    } finally {
      e.target.value = '';
    }
  }

  function removeImage(qId, idx) {
    if (readOnly) return;
    updateQuestion(qId, q => ({
      ...q,
      imagePreviews: q.imagePreviews.filter((_, i) => i !== idx),
      uploadedUrls: q.uploadedUrls.filter((_, i) => i !== idx)
    }));
  }

  /**
   * Computes real-time flags for a question block
   */
  function getQuestionFlags(q) {
    const flags = [...(q.aiFlags || [])];

    // 1. Content Flags
    if (!q.title.trim()) {
      flags.push({ severity: 'ERROR', message: 'Title is required.', field: 'title' });
    }
    if (!q.description.trim()) {
      flags.push({ severity: 'ERROR', message: 'Question text is required.', field: 'description' });
    }
    if (!q.tagId) {
      flags.push({ severity: 'ERROR', message: 'No subject assigned.', field: 'tag' });
    }

    // 2. Option Count Flags (Exactly 4 or 5)
    // Only count non-empty answers
    const filledOptions = q.answers.filter(a => a.text.trim() !== '').length;
    if (filledOptions < 4) {
      flags.push({ severity: 'ERROR', message: 'Board exam questions must have at least 4 filled options.' });
    } else if (filledOptions > 5) {
      flags.push({ severity: 'ERROR', message: 'Maximum 5 options allowed for board exams.' });
    }

    // 3. Answer Consistency Flags
    const correctCount = q.answers.filter(a => a.isCorrect).length;
    if (correctCount === 0) {
      flags.push({ severity: 'ERROR', message: 'No correct answer selected.' });
    } else if (correctCount > 1) {
      flags.push({ severity: 'ERROR', message: 'Multiple correct answers selected.' });
    }

    // 4. Duplicate Answer Text
    const texts = q.answers.map(a => a.text.trim().toLowerCase()).filter(t => t !== '');
    const uniqueTexts = new Set(texts);
    if (uniqueTexts.size < texts.length) {
      flags.push({ severity: 'ERROR', message: 'Duplicate answer choices detected.' });
    }

    return flags;
  }

  function validate(isSubmit = false) {
    for (let i = 0; i < questionsData.length; i++) {
      const q = questionsData[i];
      const prefix = questionsData.length > 1 ? `Question ${i + 1}: ` : '';

      // Drafts only require a title
      if (!q.title.trim()) {
        return `${prefix}Question title is required to save a draft.`;
      }

      // Submissions require resolving all ERRORS and BLOCKERS
      if (isSubmit) {
        const flags = getQuestionFlags(q);
        const firstError = flags.find(f => f.severity === 'ERROR' || f.severity === 'BLOCKER');
        if (firstError) {
          return `${prefix}${firstError.message} Please resolve all errors before submitting.`;
        }
      }
    }
    return '';
  }

  async function save(submit = false) {
    if (readOnly) return;
    const err = validate(submit);
    if (err) {
      alert(err);
      return;
    }

    setSaving(true);
    const savedQuestions = [];

    try {
      for (const q of questionsData) {
        const body = {
          title: q.title.trim(),
          description: q.description.trim(),
          answers: q.answers,
          tagId: q.tagId,
          images: q.uploadedUrls,
          ...(programId ? { programId } : {}),
        };

        let question;
        if (initialData && questionsData.length === 1) {
          const data = await apiAuth(`${BASE}/api/questions/${initialData._id}`, { method: 'PATCH', body });
          question = data.question;
        } else {
          const data = await apiAuth(`${BASE}/api/questions`, { method: 'POST', body });
          question = data.question;
        }

        if (submit) {
          await apiAuth(`${BASE}/api/questions/${question._id}/submit`, { method: 'POST' });
          savedQuestions.push({ ...question, state: 'pending_chair' });
        } else {
          savedQuestions.push(question);
        }
      }

      onSaved(savedQuestions, !!initialData && questionsData.length === 1);
    } catch (err) {
      alert(err.message || 'Failed to save question(s).');
    } finally {
      setSaving(false);
    }
  }

  function addQuestionBlock() {
    setQuestionsData(prev => [
      ...prev,
      {
        id: generateId(),
        title: '',
        description: '',
        answers: [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
        ],
        tagId: prev[prev.length - 1]?.tagId || '',
        imagePreviews: [],
        uploadedUrls: [],
        uploading: false,
        error: '',
      }
    ]);
  }

  function removeQuestionBlock(qId) {
    if (questionsData.length > 1) {
      setQuestionsData(prev => prev.filter(q => q.id !== qId));
    }
  }

  const anyUploading = questionsData.some(q => q.uploading);

  return (
    <div className={`qf-shell ${readOnly ? 'qf-shell--readonly' : ''}`}>
      {/* OCR upload removed — unused UI element */}

      <div className="qf-questions-list">
        {questionsData.map((q, index) => (
          <div key={q.id} className="qf-question-block">
            {questionsData.length > 1 && !readOnly && (
              <div className="qf-question-header">
                <h4>Question {index + 1}</h4>
                <button type="button" className="qf-remove-question-btn" onClick={() => removeQuestionBlock(q.id)}>Remove Question</button>
              </div>
            )}
            
            <div className="qf-grid">
              <div className="qf-field">
                <label>Question Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Beam Deflection Problem #1"
                  value={q.title}
                  onChange={(e) => updateQuestion(q.id, curr => ({ ...curr, title: e.target.value }))}
                  maxLength={120}
                  disabled={readOnly}
                />
              </div>

              <div className="qf-field">
                <label>Subject *</label>
                <select value={q.tagId} onChange={(e) => updateQuestion(q.id, curr => ({ ...curr, tagId: e.target.value }))} disabled={readOnly}>
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
                <label>Question *</label>
                <textarea
                  placeholder="Write the full question here..."
                  value={q.description}
                  onChange={(e) => updateQuestion(q.id, curr => ({ ...curr, description: e.target.value }))}
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
                  <button type="button" className="qf-secondary-btn" onClick={() => addAnswer(q.id)}>
                    + Add Answer
                  </button>
                )}
              </div>

              <div className="qf-answer-list">
                {q.answers.map((answer, idx) => (
                  <div key={idx} className="qf-answer-row">
                    <label className={`qf-answer-radio-wrap ${readOnly ? 'is-disabled' : ''}`}>
                      <input
                        className="qf-answer-radio"
                        type="radio"
                        checked={answer.isCorrect}
                        onChange={() => setCorrect(q.id, idx)}
                        title="Mark as correct"
                        disabled={readOnly}
                      />
                    </label>

                    <input
                      className="qf-answer-input"
                      type="text"
                      placeholder={`Answer ${idx + 1}`}
                      value={answer.text}
                      onChange={(e) => setAnswerText(q.id, idx, e.target.value)}
                      disabled={readOnly}
                    />

                    {q.answers.length > 2 && !readOnly ? (
                      <button type="button" className="qf-remove-btn" onClick={() => removeAnswer(q.id, idx)}>
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
                    id={`file-${q.id}`}
                    className="qf-file-input"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => handleImagePick(e, q.id)}
                  />
                  <button type="button" className="qf-secondary-btn" onClick={() => document.getElementById(`file-${q.id}`)?.click()}>
                    Choose Files
                  </button>
                  <span className="qf-upload-note">
                    {q.uploading ? 'Uploading images...' : 'JPG, PNG, or WEBP (Max 5MB each, 5 total)'}
                  </span>
                </div>
              )}

              {q.imagePreviews.length > 0 ? (
                <div className="image-previews">
                  {q.imagePreviews.map((img, idx) => (
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
                          onClick={() => removeImage(q.id, idx)}
                          className="btn-remove-img"
                        >
                          x
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : !readOnly || q.imagePreviews.length > 0 ? null : (
                <p className="qf-inline-note">No images attached.</p>
              )}
            </section>
            
            {/* Real-time Flags Section */}
            {!readOnly && (
              <div className="qf-flags-container">
                {getQuestionFlags(q).map((flag, fIdx) => (
                  <div key={fIdx} className={`qf-flag qf-flag--${flag.severity.toLowerCase()}`}>
                    <span className="qf-flag-icon">
                      {flag.severity === 'ERROR' ? '⚠️' : '🔔'}
                    </span>
                    <span className="qf-flag-message">{flag.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {!readOnly && !initialData && (
        <div className="qf-add-block">
          <button type="button" className="qf-add-question-block-btn" onClick={addQuestionBlock}>
            + Add Another Question
          </button>
        </div>
      )}

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
              disabled={saving || anyUploading}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              type="button"
              className="qf-submit-btn"
              onClick={() => save(true)}
              disabled={saving || anyUploading}
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
