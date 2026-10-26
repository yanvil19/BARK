import AuthImage from '../components/AuthImage.jsx';
import AnswerImage from './AnswerImage.jsx';
import FieldCheck from './FieldCheck.jsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage.js';
import { apiAuth, apiAuthUpload } from '../lib/api.js';
import { primeImage } from '../lib/authImageCache.js';
import { Modal } from './Modal.jsx';
import ImportReviewBubbles from './ImportReviewBubbles.jsx';
import { useToast } from './Toast.jsx';
import '../styles/components/QuestionForm.css';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substring(2);
}

function getImageFileError(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `File "${file.name}" is not an allowed type. Only JPG, PNG, and WEBP are accepted.`;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return `File "${file.name}" exceeds the 5MB size limit.`;
  }
  return '';
}

// uid is a client-only key so uploads and row removals target the right answer
function blankAnswer(isCorrect = false) {
  return { uid: generateId(), text: '', isCorrect, image: null, uploading: false };
}

function blankQuestion(inheritTagId = '') {
  return {
    id: generateId(),
    description: '',
    answers: [blankAnswer(true), blankAnswer(false)],
    tagId: inheritTagId,
    rationalization: '',
    uploadedUrls: [],
    uploadingCount: 0,
    error: '',
    aiFlags: [],
    image_required: false,
    image_note: null,
    image_flag_removed_by_user: false,
  };
}

// Brings saved, imported, or restored-draft data into the shape the form uses.
// Drafts restored from localStorage can hold upload flags from an unfinished upload.
function normalizeFormQuestion(q) {
  const answers = (Array.isArray(q.answers) ? q.answers : []).map((a) => ({
    ...(a._id ? { _id: a._id } : {}),
    uid: a.uid || generateId(),
    text: a.text || '',
    isCorrect: !!a.isCorrect,
    image: a.image || null,
    uploading: false,
  }));
  if (answers.length === 0) answers.push(blankAnswer(true));
  while (answers.length < 2) answers.push(blankAnswer(false));

  const { imagePreviews, uploading, ...rest } = q;
  return {
    ...rest,
    answers,
    uploadedUrls: Array.isArray(q.uploadedUrls) ? q.uploadedUrls : [],
    uploadingCount: 0,
    error: '',
  };
}

function toAnswerPayload(answers) {
  return answers.map(({ _id, text, isCorrect, image }) => ({
    ...(_id ? { _id } : {}),
    text,
    isCorrect,
    image: image || null,
  }));
}

function countAnswerImages(answers) {
  return answers.filter((a) => a.image || a.uploading).length;
}

// Field checks (grey → green once valid). Answers turn green once there are 4 or 5
// choices and every one has text; duplicates and the correct answer are still
// covered by the flags under the question.
function getFieldChecks(q) {
  return {
    subject: Boolean(q.tagId),
    description: (q.description || '').trim() !== '',
    answers: q.answers.length >= 4 && q.answers.length <= 5 && q.answers.every((a) => a.text.trim() !== ''),
    rationalization: (q.rationalization || '').trim() !== '',
    images: q.uploadedUrls.length > 0 && q.uploadingCount === 0,
  };
}

// Answer text box that grows with its content, so long answers wrap onto new lines
// instead of running off in one line. Answers stay single-line text: Enter is
// ignored and pasted line breaks become spaces.
function AnswerTextInput({ value, onChange, ...props }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\r?\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault();
      }}
      {...props}
    />
  );
}

export default function QuestionForm({
  me,
  tags,
  programId,
  initialData,
  initialGroupQuestions = null,
  onSaved,
  onClose,
  readOnly = false,
  importedQuestions = [],
  isImportDraft = false,
  onFeedback,
  maxImages = 5,
  maxAnswerImages = 5,
}) {
  const isImportMode = (importedQuestions && importedQuestions.length > 0) || isImportDraft;
  

  const { notify } = useToast();

  const isEditing = !!initialData || (Array.isArray(initialGroupQuestions) && initialGroupQuestions.length > 0);
  const userId = me?._id || 'guest';

  // [GROUPED QUESTIONS] — mode state
  const isEditingGroup = (Array.isArray(initialGroupQuestions) && initialGroupQuestions.length > 0) || (isEditing && !!initialData?.groupId);
  const [mode, setMode] = useState(isEditingGroup ? 'grouped' : 'single');
  const isGrouped = mode === 'grouped';

  // [GROUPED QUESTIONS] shared group context/stem text
  const [groupContext, setGroupContext] = useState(
    isEditingGroup
      ? (initialGroupQuestions?.[0]?.groupContext || initialData?.groupContext || '')
      : ''
  );

  let draftKey = null;
  if (!readOnly && !isEditing) {
    if (isImportMode) {
      draftKey = `question_draft_import_${userId}`;
    } else {
      draftKey = `question_draft_new_${userId}`;
    }
  }

  const [questionsData, setQuestionsData, clearQuestionsData] = useLocalStorage(draftKey, () => {
    // If grouped questions are provided for editing, pre-fill all of them
    if (Array.isArray(initialGroupQuestions) && initialGroupQuestions.length > 0) {
      return initialGroupQuestions.map((q) => normalizeFormQuestion({
        id: q._id || generateId(),
        _id: q._id,
        description: q.description || '',
        answers: q.answers,
        tagId: q.tag?._id || q.tag || '',
        rationalization: q.rationalization || '',
        uploadedUrls: q.images || [],
        aiFlags: [],
        image_required: q.image_required || false,
        image_note: q.image_note || null,
        image_flag_removed_by_user: q.image_flag_removed_by_user || false,
      }));
    }

    // If imported questions are provided, pre-fill all of them
    if (importedQuestions && importedQuestions.length > 0) {
      return importedQuestions.map(q => normalizeFormQuestion({
        id: generateId(),
        description: q.description || '',
        answers: q.answers,
        tagId: q.tagId || '',
        rationalization: q.rationalization || '',
        uploadedUrls: [],
        aiFlags: q.flags || [],
        // [IMPORT REVIEW - FLAG SYSTEM]
        // Image requirement tracking
        image_required: q.image_required || false,
        image_note: q.image_note || null,
        image_flag_removed_by_user: false,
      }));
    }

    // Default — single empty form or edit form
    return [normalizeFormQuestion({
      id: initialData?._id || generateId(),
      _id: initialData?._id,
      description: initialData?.description || '',
      answers: initialData?.answers,
      tagId: initialData?.tag?._id || initialData?.tag || '',
      rationalization: initialData?.rationalization || '',
      uploadedUrls: initialData?.images || [],
      aiFlags: [],
      // [IMPORT REVIEW - FLAG SYSTEM]
      image_required: initialData?.image_required || false,
      image_note: initialData?.image_note || null,
      image_flag_removed_by_user: initialData?.image_flag_removed_by_user || false,
    })];
  });

  // Drafts restored from localStorage skip the initializer above
  useEffect(() => {
    setQuestionsData((prev) => prev.map(normalizeFormQuestion));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Images already saved on the question(s) being edited. Removing one in the form
  // only drops the reference; the server deletes it after the change is saved.
  const [savedImageUrls] = useState(() => {
    const saved = Array.isArray(initialGroupQuestions) && initialGroupQuestions.length > 0
      ? initialGroupQuestions
      : initialData ? [initialData] : [];
    return new Set(saved.flatMap((q) => [
      ...(q.images || []),
      ...(q.answers || []).map((a) => a.image).filter(Boolean),
    ]));
  });

  const latestQuestionsRef = useRef(questionsData);
  latestQuestionsRef.current = questionsData;
  const mountedRef = useRef(true);
  const savedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Edits keep no local draft, so images uploaded but never saved would be orphaned
      if (!draftKey && !readOnly && !savedRef.current) {
        latestQuestionsRef.current
          .flatMap((q) => [...q.uploadedUrls, ...q.answers.map((a) => a.image)])
          .forEach(discardImage);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [saving, setSaving] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);
  const isGroupedView = readOnly && isGrouped && questionsData.length > 1;
  const useBubbleNav = (!readOnly && (isImportMode || !initialData)) || isGroupedView;
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
    if (field === 'description') return true;
    if (field === 'rationalization') return true;
    if (type === 'missing_subject' || type === 'no_correct_answer' || type === 'no_answers' || type === 'missing_rationalization') return true;

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
    updateQuestion(qId, q => ({ ...q, answers: [...q.answers, blankAnswer(false)] }));
  }

  function removeAnswer(qId, idx) {
    if (readOnly) return;
    const current = questionsData.find(q => q.id === qId);
    if (!current || current.answers.length <= 2) return;
    const removed = current.answers[idx];
    updateQuestion(qId, q => {
      if (q.answers.length <= 2) return q;
      const next = q.answers.filter((_, i) => i !== idx);
      if (!next.some((a) => a.isCorrect)) next[0] = { ...next[0], isCorrect: true };
      return { ...q, answers: next };
    });
    if (removed?.image) discardImage(removed.image);
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

  // Uploads image files and returns their URLs. The local files seed the
  // in-memory image cache, so the previews show without downloading them again.
  async function uploadImages(files) {
    const fd = new FormData();
    files.forEach((file) => fd.append('images', file));
    const data = await apiAuthUpload(`${BASE}/api/questions/upload-image`, fd);
    const urls = data.urls || [];
    urls.forEach((url, i) => primeImage(url, files[i]));
    return urls;
  }

  // Deletes an image that was uploaded in this form but never saved, so it is
  // not left orphaned in storage. Saved images are only unlinked here; the
  // server removes them once the question is saved without them.
  async function discardImage(url) {
    if (!url || savedImageUrls.has(url)) return;
    const key = url.split('/image/')[1];
    if (!key) return;
    try {
      await apiAuth(`${BASE}/api/questions/image/${key}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete image from storage:', err);
    }
  }

  async function handleImagePick(e, qId) {
    if (readOnly) return;
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (!files.length) return;

    let targetQ = questionsData.find(q => q.id === qId);
    if (!targetQ) return;

    if (targetQ.uploadedUrls.length + targetQ.uploadingCount + files.length > maxImages) {
      updateQuestion(qId, q => ({ ...q, error: `Maximum of ${maxImages} images allowed per question.` }));
      return;
    }

    for (const file of files) {
      const fileError = getImageFileError(file);
      if (fileError) {
        updateQuestion(qId, q => ({ ...q, error: fileError }));
        return;
      }
    }

    updateQuestion(qId, q => ({ ...q, uploadingCount: q.uploadingCount + files.length, error: '' }));

    try {
      const urls = await uploadImages(files);
      if (!mountedRef.current || !latestQuestionsRef.current.some(q => q.id === qId)) {
        urls.forEach(discardImage);
        return;
      }
      updateQuestion(qId, q => ({ ...q, uploadedUrls: [...q.uploadedUrls, ...urls], uploadingCount: Math.max(0, q.uploadingCount - files.length) }));
    } catch (err) {
      updateQuestion(qId, q => ({
        ...q,
        error: `Image upload failed: ${err.message}`,
        uploadingCount: Math.max(0, q.uploadingCount - files.length),
      }));
    }
  }

  function removeImage(qId, idx) {
    if (readOnly) return;

    const targetQ = questionsData.find(q => q.id === qId);
    if (!targetQ) return;
    const urlToRemove = targetQ.uploadedUrls[idx];

    updateQuestion(qId, q => ({
      ...q,
      uploadedUrls: q.uploadedUrls.filter((_, i) => i !== idx)
    }));

    discardImage(urlToRemove);
  }

  function updateAnswer(qId, answerUid, updater) {
    updateQuestion(qId, q => ({
      ...q,
      answers: q.answers.map((a) => (a.uid === answerUid ? updater(a) : a)),
    }));
  }

  // One image per answer choice; the choice still needs its text
  async function handleAnswerImagePick(e, qId, answerUid) {
    if (readOnly) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const targetQ = questionsData.find(q => q.id === qId);
    if (!targetQ) return;

    if (countAnswerImages(targetQ.answers) >= maxAnswerImages) {
      showFeedback({ message: `Only ${maxAnswerImages} answer choice(s) per question can have an image.`, tone: 'danger' });
      return;
    }

    const fileError = getImageFileError(file);
    if (fileError) {
      showFeedback({ message: fileError, tone: 'danger' });
      return;
    }

    updateAnswer(qId, answerUid, a => ({ ...a, uploading: true }));

    try {
      const [url] = await uploadImages([file]);
      const stillInForm = mountedRef.current && latestQuestionsRef.current.some(
        q => q.id === qId && q.answers.some(a => a.uid === answerUid)
      );
      if (!stillInForm) {
        discardImage(url);
        return;
      }
      updateAnswer(qId, answerUid, a => ({ ...a, image: url, uploading: false }));
    } catch (err) {
      updateAnswer(qId, answerUid, a => ({ ...a, uploading: false }));
      showFeedback({ message: `Image upload failed: ${err.message}`, tone: 'danger' });
    }
  }

  function removeAnswerImage(qId, answerUid) {
    if (readOnly) return;
    const answer = questionsData.find(q => q.id === qId)?.answers.find(a => a.uid === answerUid);
    updateAnswer(qId, answerUid, a => ({ ...a, image: null }));
    if (answer?.image) discardImage(answer.image);
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
    const hasAnyImage = q.uploadedUrls.length > 0 || q.uploadingCount > 0;

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

    // Answer images are optional, but every choice needs its text
    const imageOnlyIdx = q.answers.findIndex(a => a.image && !a.text.trim());
    if (imageOnlyIdx !== -1) {
      flags.push({ severity: 'BLOCKER', message: `Answer ${imageOnlyIdx + 1} has an image but no text.`, field: 'answers', type: 'answer_image_without_text' });
    }

    const answerImageCount = countAnswerImages(q.answers);
    if (answerImageCount > maxAnswerImages) {
      flags.push({
        severity: 'ERROR',
        message: maxAnswerImages === 0
          ? 'Answer images are turned off. Remove the images from the answer choices.'
          : `Only ${maxAnswerImages} answer choice(s) can have an image.`,
        field: 'answers',
        type: 'too_many_answer_images',
      });
    }

    // 3. Answer Consistency Flags
    const correctAnswers = q.answers.filter(a => a.isCorrect);
    if (correctAnswers.length === 0) {
      flags.push({ severity: 'BLOCKER', message: 'No correct answer selected', field: 'correct', type: 'no_correct_answer' });
    } else if (correctAnswers.length > 1) {
      flags.push({ severity: 'ERROR', message: 'Multiple correct answers selected.' });
    } else if (!correctAnswers[0].text.trim() && !correctAnswers[0].image) {
      // Empty rows are dropped on save, so an empty correct answer would leave none selected
      flags.push({ severity: 'BLOCKER', message: 'The correct answer is empty.', field: 'correct', type: 'empty_correct_answer' });
    }

    // 4. Duplicate Answer Text
    const texts = q.answers.map(a => a.text.trim().toLowerCase()).filter(t => t !== '');
    const uniqueTexts = new Set(texts);
    if (uniqueTexts.size < texts.length) {
      flags.push({ severity: 'ERROR', message: 'Duplicate answer choices detected', field: 'answers', type: 'duplicate_answers' });
    }

    // 5. Rationalization Required
    if (!q.rationalization || !q.rationalization.trim()) {
      flags.push({ severity: 'BLOCKER', message: 'Rationalization is required.', field: 'rationalization', type: 'missing_rationalization' });
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

      // Check if question prompt / body is entered
      if (!q.description || !q.description.trim()) {
        return `${prefix}Question prompt / description is required.`;
      }

      // The server rejects drafts over the answer image limit too
      if (countAnswerImages(q.answers) > maxAnswerImages) {
        return maxAnswerImages === 0
          ? `${prefix}Answer images are turned off. Remove the images from the answer choices.`
          : `${prefix}Only ${maxAnswerImages} answer choice(s) per question can have an image.`;
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

    // [GROUPED QUESTIONS] — enforce minimum of 2 questions
    if (isGrouped && !readOnly && questionsData.length < 2) {
      return 'A question group must have at least 2 questions.';
    }

    return '';
  }


  async function save(submit = false) {
    if (readOnly) return;
    const err = validate(submit);
    if (err) {
      showFeedback({
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
      // [GROUPED QUESTIONS] — creating a new group
      if (isGrouped && !isEditing) {
        const questionsPayload = questionsData.map(q => ({
          description: q.description.trim(),
          answers: toAnswerPayload(q.answers),
          tagId: q.tagId,
          rationalization: q.rationalization?.trim() || '',
          images: q.uploadedUrls,
          image_required: q.image_required,
          image_note: q.image_note,
          image_flag_removed_by_user: q.image_flag_removed_by_user,
        }));

        const data = await apiAuth(`${BASE}/api/questions/group`, {
          method: 'POST',
          body: {
            questions: questionsPayload,
            programId,
            groupContext: groupContext.trim() || null,
          },
        });

        if (submit) {
          const subData = await apiAuth(`${BASE}/api/questions/group/${data.groupId}/submit`, { method: 'POST' });
          savedQuestions.push(...subData.questions);
          window.dispatchEvent(new CustomEvent('badge-counts-updated'));
        } else {
          savedQuestions.push(...data.questions);
        }
      } else if (isGrouped && isEditing) {
        // [GROUPED QUESTIONS] — updating an existing group
        const targetGroupId = initialGroupQuestions?.[0]?.groupId || initialData?.groupId;
        const questionsPayload = questionsData.map(q => ({
          _id: q._id,
          description: q.description.trim(),
          answers: toAnswerPayload(q.answers),
          tagId: q.tagId,
          rationalization: q.rationalization?.trim() || '',
          images: q.uploadedUrls,
          image_required: q.image_required,
          image_note: q.image_note,
          image_flag_removed_by_user: q.image_flag_removed_by_user,
        }));

        const data = await apiAuth(`${BASE}/api/questions/group/${targetGroupId}`, {
          method: 'PUT',
          body: {
            questions: questionsPayload,
            groupContext: groupContext.trim() || null,
          },
        });

        if (submit) {
          const subData = await apiAuth(`${BASE}/api/questions/group/${targetGroupId}/submit`, { method: 'POST' });
          savedQuestions.push(...subData.questions);
          window.dispatchEvent(new CustomEvent('badge-counts-updated'));
        } else {
          savedQuestions.push(...data.questions);
        }
      } else {
        // Single question mode (existing logic)
        for (const q of questionsData) {
          const body = {
            description: q.description.trim(),
            answers: toAnswerPayload(q.answers),
            tagId: q.tagId,
            rationalization: q.rationalization?.trim() || '',
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
        if (submit) {
          window.dispatchEvent(new CustomEvent('badge-counts-updated'));
        }
      }

      if (clearQuestionsData) {
        clearQuestionsData();
      }
      savedRef.current = true;
      onSaved(savedQuestions, !!initialData && questionsData.length === 1);
    } catch (err) {
      showFeedback({
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
            description: q.description.trim(),
            answers: toAnswerPayload(q.answers),
            tagId: q.tagId,
            rationalization: q.rationalization?.trim() || '',
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
        window.dispatchEvent(new CustomEvent('badge-counts-updated'));
        savedRef.current = true;
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
        blankQuestion(prev[prev.length - 1]?.tagId || ''),
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

  // When switching modes, reset to a fresh single/double-question state
  function handleModeChange(newMode) {
    if (newMode === mode || isEditing) return;
    setMode(newMode);
    if (newMode === 'grouped') {
      // Ensure at least 2 blocks when entering grouped mode
      if (questionsData.length < 2) {
        setQuestionsData([
          questionsData[0] || blankQuestion(),
          blankQuestion(questionsData[0]?.tagId || ''),
        ]);
      }
    } else {
      // Back to single — trim to first question only
      setQuestionsData([questionsData[0] || blankQuestion()]);
    }
    setCurrentQuestionIdx(0);
  }

  const anyUploading = questionsData.some(q => q.uploadingCount > 0 || q.answers.some(a => a.uploading));

  // Render a single question block (shared between single and grouped modes)
  function renderQuestionBlock(q, index) {
    const checks = getFieldChecks(q);
    // Images are optional unless the import flagged this question as needing one
    const imageRequired = q.image_required && !q.image_flag_removed_by_user;

    return (
      <div key={q.id} className="qf-question-block">
        {/* ── Header ── */}
        {isGrouped ? (
          <div className="qf-group-question-header">
            <div className="qf-group-question-header-left">
              <span className="qf-group-q-number">{index + 1}</span>
              <h4>Question {index + 1}</h4>
            </div>
            {/* Remove — min 2 */}
            {!readOnly && questionsData.length > 2 && (
              <button
                type="button"
                className="qf-remove-question-btn"
                onClick={() => removeQuestionBlock(q.id)}
              >
                Remove
              </button>
            )}
          </div>
        ) : questionsData.length > 1 && !readOnly && !initialData ? (
          <div className="qf-question-header">
            <h4>Question {index + 1}</h4>
            <button type="button" className="qf-remove-question-btn" onClick={() => removeQuestionBlock(q.id)}>Remove Question</button>
          </div>
        ) : null}

        <div className="qf-grid">
          <div className="qf-field">
            <label className="qf-label-row">Subject * {!readOnly && <FieldCheck valid={checks.subject} />}</label>
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
            <label className="qf-label-row">Question * {!readOnly && <FieldCheck valid={checks.description} />}</label>
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
              <h3 className="qf-label-row">
                {imageRequired ? 'Images *' : 'Images'}
                {!readOnly && imageRequired && <FieldCheck valid={checks.images} />}
              </h3>
              <p>
                {readOnly
                  ? 'Images attached to this question.'
                  : `${imageRequired ? 'Required for this question' : 'Optional'}, maximum of ${maxImages} images.`}
              </p>
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
                {q.uploadingCount > 0 ? 'Uploading images...' : `JPG, PNG, or WEBP (Max 5MB each, ${maxImages} total)`}
              </span>
            </div>
          )}

          {!readOnly && q.error ? (
            <p className="qf-inline-note qf-inline-note--error">{q.error}</p>
          ) : null}

          {q.uploadedUrls.length > 0 || q.uploadingCount > 0 ? (
            <div className="image-previews">
              {q.uploadedUrls.map((url, idx) => (
                <div key={url} className="image-thumb">
                  <AuthImage
                    src={url}
                    alt=""
                    onClick={() => setFullscreenImage(url)}
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
              {Array.from({ length: q.uploadingCount }, (_, idx) => (
                <div key={`uploading-${idx}`} className="image-thumb image-thumb--uploading">Uploading...</div>
              ))}
            </div>
          ) : readOnly ? (
            <p className="qf-inline-note">No images attached.</p>
          ) : null}
        </section>

        <section className="qf-section">
          <div className="qf-section-heading">
            <div>
              <h3 className="qf-label-row">Answers * {!readOnly && <FieldCheck valid={checks.answers} />}</h3>
              <p>{readOnly ? 'The correct answer is marked with a selected radio button.' : 'Select the radio button to mark the correct answer.'}</p>
            </div>
            {!readOnly && (
              <button type="button" className="qf-secondary-btn" onClick={() => addAnswer(q.id)}>
                + Add Answer
              </button>
            )}
          </div>

          <div className="qf-answer-list">
            {q.answers.map((answer, idx) => {
              const canAddImage = !readOnly && !answer.image && !answer.uploading
                && countAnswerImages(q.answers) < maxAnswerImages;
              const fileInputId = `answer-file-${q.id}-${answer.uid}`;

              return (
                <div key={answer.uid || idx} className="qf-answer-row">
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

                  <div className="qf-answer-main">
                    <AnswerTextInput
                      className="qf-answer-input"
                      placeholder={`Answer ${idx + 1}`}
                      value={answer.text}
                      onChange={(text) => setAnswerText(q.id, idx, text)}
                      disabled={readOnly}
                    />

                    {answer.image ? (
                      <div className="qf-answer-image">
                        <AnswerImage src={answer.image} alt={`Answer ${idx + 1} image`} onZoom={setFullscreenImage} />
                        {!readOnly && (
                          <button
                            type="button"
                            className="btn-remove-img"
                            onClick={() => removeAnswerImage(q.id, answer.uid)}
                            aria-label={`Remove image from answer ${idx + 1}`}
                          >
                            x
                          </button>
                        )}
                      </div>
                    ) : answer.uploading ? (
                      <span className="qf-upload-note">Uploading image...</span>
                    ) : null}
                  </div>

                  {!readOnly && (canAddImage || q.answers.length > 2) ? (
                    <div className="qf-answer-actions">
                      {canAddImage && (
                        <>
                          <input
                            id={fileInputId}
                            className="qf-file-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => handleAnswerImagePick(e, q.id, answer.uid)}
                          />
                          <button
                            type="button"
                            className="qf-secondary-btn"
                            onClick={() => document.getElementById(fileInputId)?.click()}
                          >
                            Add Image
                          </button>
                        </>
                      )}
                      {q.answers.length > 2 && (
                        <button type="button" className="qf-remove-btn" onClick={() => removeAnswer(q.id, idx)}>
                          Remove
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {!readOnly && maxAnswerImages > 0 && (
            <p className="qf-upload-note qf-answer-image-note">
              {`Answer text is required. You can add one optional image per answer (JPG, PNG, or WEBP, max 5MB), on up to ${maxAnswerImages} answer${maxAnswerImages === 1 ? '' : 's'}.`}
            </p>
          )}
        </section>

        {/* Rationalization Field */}
        <section className="qf-section qf-section--rationalization">
          <div className="qf-section-heading">
            <div>
              <h3 className="qf-label-row">Rationalization * {!readOnly && <FieldCheck valid={checks.rationalization} />}</h3>
              <p>{readOnly ? 'Explanation for the correct answer.' : 'Explain why the correct answer is correct. This is required before submission.'}</p>
            </div>
          </div>
          <div className="qf-field qf-field--full">
            <textarea
              className="qf-rationalization-textarea"
              placeholder="Provide a clear explanation of why the correct answer is correct, and why the other options are incorrect..."
              value={q.rationalization || ''}
              onChange={(e) => updateQuestion(q.id, curr => ({ ...curr, rationalization: e.target.value }))}
              rows={4}
              disabled={readOnly}
            />
          </div>
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
                        disabled={q.uploadingCount > 0}
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
  }

  return (
    <div className={`qf-shell ${readOnly ? 'qf-shell--readonly' : ''}`}>
      {/* [GROUPED QUESTIONS] Mode indicator / toggle */}
      {!readOnly && !isEditing && !isImportMode && (
        <div className="qf-mode-toggle" role="group" aria-label="Question mode">
          <button
            type="button"
            id="qf-mode-single"
            className={`qf-mode-btn ${mode === 'single' ? 'qf-mode-btn--active' : ''}`}
            onClick={() => handleModeChange('single')}
          >
            Single Question
          </button>
          <button
            type="button"
            id="qf-mode-grouped"
            className={`qf-mode-btn ${mode === 'grouped' ? 'qf-mode-btn--active' : ''}`}
            onClick={() => handleModeChange('grouped')}
          >
            Grouped Questions
          </button>
        </div>
      )}

      {isGrouped && isEditing && !readOnly && (
        <div className="qf-mode-toggle" style={{ pointerEvents: 'none' }}>
          <button
            type="button"
            className="qf-mode-btn qf-mode-btn--active"
            style={{ width: '100%' }}
          >
            Editing Question Set ({questionsData.length} questions)
          </button>
        </div>
      )}

      {/* [GROUPED QUESTIONS] Group context/stem field */}
      {isGrouped && (
        <>
          <div className="qf-group-context-section">
            <div className="qf-group-context-label">
              <strong>Group Context / Stem</strong>
              <span>
                {readOnly
                  ? 'Shared passage, scenario, or context shown above all questions in this group.'
                  : 'Optional — a shared passage, scenario, or image shown above all questions in this group during the exam.'}
              </span>
            </div>
            <textarea
              className="qf-group-context-textarea"
              placeholder={readOnly ? 'No shared context provided.' : "e.g. 'Read the following passage and answer questions 1–3:' or leave blank if not needed."}
              value={groupContext}
              onChange={e => setGroupContext(e.target.value)}
              rows={3}
              disabled={readOnly}
            />
          </div>
          <div className="qf-group-notice">
            <span className="qf-group-notice-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <span>These questions will always appear together in a fixed order and cannot be randomized separately during exams.</span>
          </div>
        </>
      )}

      {/* [IMPORT REVIEW - BUBBLE NAVIGATION] */}
      {useBubbleNav && (
        <ImportReviewBubbles
          questions={questionsData}
          currentIdx={currentQuestionIdx}
          onSelectQuestion={setCurrentQuestionIdx}
          getQuestionFlags={getVisibleQuestionFlags}
          readOnly={readOnly}
        />
      )}

      <div className="qf-questions-list">
        {questionsData.map((q, index) => {
          // Only show current question when using bubble navigation
          if (useBubbleNav && index !== currentQuestionIdx) return null;

          return renderQuestionBlock(q, index);
        })}
      </div>

      {/* Add another question — single mode (non-import) */}
      {!readOnly && !initialData && !isImportMode && mode === 'single' && (
        <div className="qf-add-block">
          <button type="button" className="qf-add-question-block-btn" onClick={addQuestionBlock}>
            + Add Another Question
          </button>
        </div>
      )}

      {/* [GROUPED QUESTIONS] Add question to group */}
      {isGrouped && !readOnly && (
        <div className="qf-group-add-block">
          <button type="button" className="qf-group-add-btn" onClick={addQuestionBlock}>
            + Add Question to Group
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
            <AuthImage src={fullscreenImage} alt="Fullscreen" className="fullscreen-img" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
