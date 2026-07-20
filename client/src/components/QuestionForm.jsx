import { useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { apiAuth, apiAuthUpload } from '../lib/api.js';
import { Modal } from './Modal.jsx';
import ImportReviewBubbles from './ImportReviewBubbles.jsx';
import { useToast } from './Toast.jsx';
import '../styles/components/QuestionForm.css';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substring(2);
}

export default function QuestionForm({
  me,
  tags,
  programId,
  initialData,
  onSaved,
  onClose,
  readOnly = false,
  importedQuestions = [],
  isImportDraft = false,
  onFeedback,
  maxImages = 5,
}) {
  const isImportMode = (importedQuestions && importedQuestions.length > 0) || isImportDraft;
  const useBubbleNav = !readOnly && (isImportMode || !initialData);

  const { notify } = useToast();

  const isEditing = !!initialData;
  const userId = me?._id || 'guest';
  
  let draftKey = null;
  if (!readOnly && !isEditing) {
    if (isImportMode) {
      draftKey = `question_draft_import_${userId}`;
    } else {
      draftKey = `question_draft_new_${userId}`;
    }
  }

  const [questionsData, setQuestionsData, clearQuestionsData] = useLocalStorage(draftKey, () => {
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
        aiFlags: q.flags || [],
        // [IMPORT REVIEW - FLAG SYSTEM]
        // Image requirement tracking
        image_required: q.image_required || false,
        image_note: q.image_note || null,
        image_flag_removed_by_user: false,
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
      // [IMPORT REVIEW - FLAG SYSTEM]
      image_required: initialData?.image_required || false,
      image_note: initialData?.image_note || null,
      image_flag_removed_by_user: initialData?.image_flag_removed_by_user || false,
    }];
  });

  const [saving, setSaving] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);
  const [showRemoveImageFlag, setShowRemoveImageFlag] = useState(false);
  const [imageRemovalQuestionIdx, setImageRemovalQuestionIdx] = useState(null);
  const [dismissedFlags, setDismissedFlags] = useState({});

  function getFlagKey(qId, flag) {
    return `${qId}::${flag.type ?? flag.field ?? flag.message ?? 'flag'}`;
  }

  function sanitizeFlagMessage(message) {
    if (!message) return '';
    return String(message)
      // Strip leading emoji (and common mojibake cases when file encoding is off)
      .replace(/^(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\s)+/u, '')
      .replace(/^(?:[âð].{1,16}\s+)/, '')
      .trim();
  }

  function FlagSeverityIcon({ severity }) {
    const upper = String(severity || '').toUpperCase();
    const isError = upper === 'ERROR' || upper === 'BLOCKER';

    const commonProps = {
      className: 'qf-icon',
      width: 16,
      height: 16,
      viewBox: '0 0 24 24',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
      'aria-hidden': true,
      focusable: false,
    };

    return isError ? (
      <svg {...commonProps}>
        <path d="M12 9v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 17h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M10.29 3.86a2 2 0 0 1 3.42 0l8.2 14.18A2 2 0 0 1 20.2 21H3.8a2 2 0 0 1-1.71-2.96l8.2-14.18Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    ) : (
      <svg {...commonProps}>
        <path d="M12 21a9 9 0 1 0-9-9 9 9 0 0 0 9 9Z" stroke="currentColor" strokeWidth="2" />
        <path d="M12 8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 16h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  function isNonDismissableFlag(flag) {
    if (!flag) return false;
    const field = flag.field;
    const type = flag.type;
    const msg = sanitizeFlagMessage(flag.message);

    // Blocker-style flags: subject/tag + answer correctness/completeness
    if (field === 'tag' || field === 'subject') return true;
    if (field === 'correct' || field === 'answers') return true;
    if (field === 'title' || field === 'description') return true;
    if (type === 'missing_subject' || type === 'no_correct_answer' || type === 'no_answers') return true;

    return msg === 'No subject assigned.' || msg === 'No correct answer selected' || msg === 'Question must have at least 4 answer choices';
  }

  function showFeedback({ title = 'Notification', message, tone = 'info' }) {
    if (!message) return;

    notify(message, { variant: tone === 'danger' ? 'error' : tone });

    if (typeof onFeedback === 'function') {
      onFeedback({ title, message, tone });
    }
  }

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

  function dismissFlag(qId, flag) {
    const flagKey = getFlagKey(qId, flag);
    setDismissedFlags(prev => ({ ...prev, [flagKey]: true }));
  }

  async function handleImagePick(e, qId) {
    if (readOnly) return;
    const files = Array.from(e.target.files);
    if (!files.length) return;

    let targetQ = questionsData.find(q => q.id === qId);
    if (!targetQ) return;

    if (targetQ.imagePreviews.length + files.length > maxImages) {
      updateQuestion(qId, q => ({ ...q, error: `Maximum of ${maxImages} images allowed per question.` }));
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

  // [IMPORT REVIEW - FLAG SYSTEM]
  // Handle image requirement flag removal with confirmation
  function handleRemoveImageFlag(qIdx) {
    setImageRemovalQuestionIdx(qIdx);
    setShowRemoveImageFlag(true);
  }

  function confirmRemoveImageFlag() {
    if (imageRemovalQuestionIdx !== null) {
      const q = questionsData[imageRemovalQuestionIdx];
      updateQuestion(q.id, curr => ({ ...curr, image_flag_removed_by_user: true }));
      setShowRemoveImageFlag(false);
      setImageRemovalQuestionIdx(null);
    }
  }

  /**
   * Computes real-time flags for a question block
   */
  function getQuestionFlags(q) {
    const hasAnyImage =
      (Array.isArray(q.uploadedUrls) && q.uploadedUrls.length > 0) ||
      (Array.isArray(q.imagePreviews) && q.imagePreviews.length > 0);

    const aiFlags = (q.aiFlags || []).filter((f) => {
      const msg = sanitizeFlagMessage(f?.message);
      if (hasAnyImage && msg === 'This question references an image that could not be automatically linked. Please upload it manually.') {
        return false;
      }
      return true;
    });

    const flags = [...aiFlags];

    // [IMPORT REVIEW - FLAG SYSTEM]
    // FLAG 1: Missing Image
    if (q.image_required && !q.image_flag_removed_by_user && !hasAnyImage) {
      flags.push({
        severity: 'ERROR',
        message: 'This question requires an image',
        type: 'missing_image',
        field: 'image'
      });
    }

    // 1. Content Flags
    if (!q.title.trim()) {
      flags.push({ severity: 'ERROR', message: 'Question Title cannot be empty', field: 'title' });
    }
    if (!q.description.trim()) {
      flags.push({ severity: 'ERROR', message: 'Question text cannot be empty', field: 'description' });
    }
    if (!q.tagId) {
      flags.push({ severity: 'BLOCKER', message: 'No subject assigned.', field: 'tag', type: 'missing_subject' });
    }

    // 2. Option Count Flags (Exactly 4 or 5)
    // Only count non-empty answers
    const filledOptions = q.answers.filter(a => a.text.trim() !== '').length;
    if (filledOptions === 0) {
      flags.push({ severity: 'BLOCKER', message: 'At least one answer is required', field: 'answers', type: 'no_answers' });
    }
    if (filledOptions < 4) {
      flags.push({ severity: 'ERROR', message: 'Question must have at least 4 answer choices' });
    } else if (filledOptions > 5) {
      flags.push({ severity: 'ERROR', message: 'Maximum 5 options allowed for board exams.' });
    }

    // 3. Answer Consistency Flags
    const correctCount = q.answers.filter(a => a.isCorrect).length;
    if (correctCount === 0) {
      flags.push({ severity: 'BLOCKER', message: 'No correct answer selected', field: 'correct', type: 'no_correct_answer' });
    } else if (correctCount > 1) {
      flags.push({ severity: 'ERROR', message: 'Multiple correct answers selected.' });
    }

    // 4. Duplicate Answer Text
    const texts = q.answers.map(a => a.text.trim().toLowerCase()).filter(t => t !== '');
    const uniqueTexts = new Set(texts);
    if (uniqueTexts.size < texts.length) {
      flags.push({ severity: 'ERROR', message: 'Duplicate answer choices detected', field: 'answers', type: 'duplicate_answers' });
    }

    return flags;
  }

  function getVisibleQuestionFlags(q) {
    return getQuestionFlags(q).filter((flag) => {
      if (isNonDismissableFlag(flag)) return true;
      return !dismissedFlags[getFlagKey(q.id, flag)];
    });
  }

  function validate(isSubmit = false) {
    for (let i = 0; i < questionsData.length; i++) {
      const q = questionsData[i];
      const prefix = questionsData.length > 1 ? `Question ${i + 1}: ` : '';

      // Drafts only require a title
      if (!q.title.trim()) {
        return `${prefix}Question title is required to save a draft.`;
      }

      // Submissions always require resolving BLOCKERS (even in import mode)
      if (isSubmit) {
        const allFlags = getQuestionFlags(q);
        const firstBlocker = allFlags.find(f => f.severity === 'BLOCKER');
        if (firstBlocker) {
          return `${prefix}${sanitizeFlagMessage(firstBlocker.message)} Please resolve this before submitting.`;
        }
      }

      // Submissions require resolving all ERRORS (unless in import mode)
      if (isSubmit && !isImportMode) {
        const flags = getVisibleQuestionFlags(q);
        const firstError = flags.find(f => f.severity === 'ERROR');
        if (firstError) {
          return `${prefix}${sanitizeFlagMessage(firstError.message)} Please resolve all errors before submitting.`;
        }
      }
    }
    return '';
  }

  async function save(submit = false) {
    if (readOnly) return;
    const err = validate(submit);
    if (err) {
      showFeedback({
        title: submit ? 'Cannot Submit Question' : 'Cannot Save Draft',
        message: err,
        tone: 'danger',
      });
      return;
    }

    // [IMPORT REVIEW - SUBMIT BEHAVIOR]
    // Show warning if submitting with flagged questions in import mode
    if (submit && isImportMode) {
      const flaggedQuestions = questionsData
        .map((q, idx) => ({
          idx,
          flags: getQuestionFlags(q),
          number: idx + 1
        }))
        .filter(q => q.flags.length > 0);

      if (flaggedQuestions.length > 0) {
        setShowSubmitWarning(true);
        return;
      }
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
          // [IMPORT REVIEW - FLAG SYSTEM]
          // Save image requirement tracking
          image_required: q.image_required,
          image_note: q.image_note,
          image_flag_removed_by_user: q.image_flag_removed_by_user,
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

      if (clearQuestionsData) {
        clearQuestionsData();
      }
      onSaved(savedQuestions, !!initialData && questionsData.length === 1);
    } catch (err) {
      showFeedback({
        title: 'Save Failed',
        message: err.message || 'Failed to save question(s).',
        tone: 'danger',
      });
    } finally {
      setSaving(false);
    }
  }

  function confirmSubmitWithWarning() {
    const err = validate(true);
    if (err) {
      notify(err, { variant: 'error' });
      return;
    }

    setShowSubmitWarning(false);
    setSaving(true);
    const saveAsync = async () => {
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
            image_required: q.image_required,
            image_note: q.image_note,
            image_flag_removed_by_user: q.image_flag_removed_by_user,
          };

          let question;
          if (initialData && questionsData.length === 1) {
            const data = await apiAuth(`${BASE}/api/questions/${initialData._id}`, { method: 'PATCH', body });
            question = data.question;
          } else {
            const data = await apiAuth(`${BASE}/api/questions`, { method: 'POST', body });
            question = data.question;
          }

          await apiAuth(`${BASE}/api/questions/${question._id}/submit`, { method: 'POST' });
          savedQuestions.push({ ...question, state: 'pending_chair' });
        }

        if (clearQuestionsData) {
          clearQuestionsData();
        }
        onSaved(savedQuestions, !!initialData && questionsData.length === 1);
      } catch (err) {
        notify(err.message || 'Failed to save question(s).', { variant: 'error' });
      } finally {
        setSaving(false);
      }
    };
    saveAsync();
  }

  function addQuestionBlock() {
    setQuestionsData(prev => {
      const next = [
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
      ];
      setCurrentQuestionIdx(next.length - 1);
      return next;
    });
  }

  function removeQuestionBlock(qId) {
    if (questionsData.length > 1) {
      setQuestionsData(prev => {
        const removeIndex = prev.findIndex(q => q.id === qId);
        const next = prev.filter(q => q.id !== qId);
        setCurrentQuestionIdx((curr) => {
          if (next.length === 0) return 0;
          if (removeIndex < 0) return Math.min(curr, next.length - 1);
          if (curr > removeIndex) return curr - 1;
          if (curr === removeIndex) return Math.max(0, Math.min(curr, next.length - 1));
          return Math.min(curr, next.length - 1);
        });
        return next;
      });
    }
  }

  const anyUploading = questionsData.some(q => q.uploading);

  return (
      <div className={`qf-shell ${readOnly ? 'qf-shell--readonly' : ''}`}>
       {/* [IMPORT REVIEW - BUBBLE NAVIGATION] */}
       {useBubbleNav && (
         <ImportReviewBubbles
           questions={questionsData}
           currentIdx={currentQuestionIdx}
           onSelectQuestion={setCurrentQuestionIdx}
           getQuestionFlags={getVisibleQuestionFlags}
         />
       )}

      <div className="qf-questions-list">
        {questionsData.map((q, index) => {
          // Only show current question when using bubble navigation
          if (useBubbleNav && index !== currentQuestionIdx) return null;

          return (
            <div key={q.id} className="qf-question-block">
              {questionsData.length > 1 && !readOnly && !initialData && (
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
                    <p>{readOnly ? 'Images attached to this question.' : `Optional, maximum of ${maxImages} images.`}</p>
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
                      {q.uploading ? 'Uploading images...' : `JPG, PNG, or WEBP (Max 5MB each, ${maxImages} total)`}
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

              {/* [IMPORT REVIEW - FLAG SYSTEM] */}
              {!readOnly && (
                <div className="qf-flags-container">
                  {getVisibleQuestionFlags(q).map((flag, fIdx) => (
                    <div key={fIdx} className={`qf-flag qf-flag--${flag.severity.toLowerCase()}`}>
                      <span className="qf-flag-icon">
                        <FlagSeverityIcon severity={flag.severity} />
                      </span>
                      <span className="qf-flag-message">{sanitizeFlagMessage(flag.message)}</span>

                      <div className="qf-flag-right">
                      {/* [IMPORT REVIEW - FLAG SYSTEM] */}
                      {/* Image requirement flag actions */}
                      {flag.type === 'missing_image' && (
                        <div className="qf-flag-actions">
                          <button
                            type="button"
                            className="qf-flag-action-btn qf-flag-action-upload"
                            onClick={() => document.getElementById(`file-${q.id}`)?.click()}
                            disabled={q.uploading}
                          >
                            <span className="qf-btn-icon" aria-hidden="true">
                              <svg className="qf-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M4 14v4a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </span>
                            Upload Image
                          </button>
                          <button
                            type="button"
                            className="qf-flag-action-btn qf-flag-action-remove"
                            onClick={() => handleRemoveImageFlag(index)}
                          >
                            <span className="qf-btn-icon" aria-hidden="true">
                              <svg className="qf-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </span>
                            Remove Flag
                          </button>
                        </div>
                      )}

                      {!isNonDismissableFlag(flag) && (
                        <button
                          type="button"
                          className="qf-flag-dismiss"
                          onClick={() => dismissFlag(q.id, flag)}
                          aria-label="Dismiss flag"
                          title="Dismiss"
                        >
                          {'\u00D7'}
                        </button>
                      )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && !initialData && !isImportMode && (
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

      {/* [IMPORT REVIEW - SUBMIT BEHAVIOR] */}
      <Modal
        open={showSubmitWarning}
        onClose={() => setShowSubmitWarning(false)}
        title="Unresolved Flags"
      >
        <div className="submit-warning-content">
          <p className="submit-warning-message">
            The following questions still have unresolved flags:
          </p>
          <p className="qf-inline-note">
            Note: Dismissed flags are still listed here as (dismissed).
          </p>
          <ul className="submit-warning-list">
            {questionsData
              .map((q, idx) => ({
                idx,
                qId: q.id,
                flags: getQuestionFlags(q),
                number: idx + 1
              }))
              .filter(q => q.flags.length > 0)
              .map(q => (
                <li key={q.idx}>
                  <strong>Question {q.number}</strong>
                  {' — '}
                  {q.flags
                    .map((f) => {
                      const dismissed = dismissedFlags[getFlagKey(q.qId, f)];
                      const msg = sanitizeFlagMessage(f.message);
                      return dismissed ? `${msg} (dismissed)` : msg;
                    })
                    .join(', ')}
                </li>
              ))}
          </ul>
          <p className="submit-warning-note">
            Are you sure you want to submit?<br />
            You can edit and fix these after submission.
          </p>
        </div>
        <div className="modal-actions qp-modal-actions">
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={() => setShowSubmitWarning(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="qf-submit-btn"
            onClick={confirmSubmitWithWarning}
            disabled={saving}
            style={{ width: 'auto' }}
          >
            {saving ? 'Submitting...' : 'Submit Anyway'}
          </button>
        </div>
      </Modal>

      {/* Image flag removal confirmation */}
      <Modal
        open={showRemoveImageFlag}
        onClose={() => setShowRemoveImageFlag(false)}
        title="Remove Image Requirement"
      >
        <p className="modal-text">
          Are you sure? This will mark the question as not needing an image.
        </p>
        <div className="modal-actions qp-modal-actions">
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={() => setShowRemoveImageFlag(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn-danger"
            onClick={confirmRemoveImageFlag}
          >
            Yes, Remove Flag
          </button>
        </div>
      </Modal>

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
