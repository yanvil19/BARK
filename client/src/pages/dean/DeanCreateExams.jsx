import { useEffect, useMemo, useState } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage.js';
import { apiAuth } from '../../lib/api.js';
import { organizeQuestionAnswers } from '../../lib/DeanTestRunOrganizer.js';
import { getStatusLabel } from '../../utils/statusLabels.js';
import DateTimePicker from '../../components/DateTimePicker.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import '../../styles/dean/DeanCreateExams.css';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + 'T' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes())
  );
}

function ensureISOString(value) {
  if (!value) return '';
  // If already in ISO format with Z, return as-is
  if (value.endsWith('Z')) return value;
  // If it's a local string, convert via Date object to ISO+Z
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function formatDurationFromMinutes(value) {
  const total = Number(value);
  if (!Number.isFinite(total) || total <= 0) return '';
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (hrs && mins) return `${hrs} hours ${mins} minutes`;
  if (hrs) return `${hrs} hour${hrs === 1 ? '' : 's'}`;
  return `${mins} minute${mins === 1 ? '' : 's'}`;
}

export default function MockBoardExam({ me, editingExamId, onExamSaved, onClearEditing }) {
  const isEditing = !!editingExamId;
  const userId = me?._id || 'guest';
  const baseKey = isEditing ? null : `mbe_new_${userId}`;

  const [programs, setPrograms] = useState([]);
  const [programId, setProgramId, clearProgramId] = useLocalStorage(baseKey ? `${baseKey}_programId` : null, '');
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [selectedTagIds, setSelectedTagIds, clearTagIds] = useLocalStorage(baseKey ? `${baseKey}_tags` : null, []);
  const [approvedQuestions, setApprovedQuestions] = useState([]);
  const [selectedQuestions, setSelectedQuestions, clearQuestions] = useLocalStorage(baseKey ? `${baseKey}_questions` : null, []);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackByQuestionId, setFeedbackByQuestionId] = useState({});
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [questionFilterTagId, setQuestionFilterTagId] = useState('');
  const [approvedSelectionFilter, setApprovedSelectionFilter] = useState('all');
  const [questionStateFilter, setQuestionStateFilter] = useState('all');
  const [selectedQuestionFilterTagId, setSelectedQuestionFilterTagId] = useState('');
  const [expandedQuestionIds, setExpandedQuestionIds] = useState({});
  const [returnModal, setReturnModal] = useState(null);
  const [returnNote, setReturnNote] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [form, setForm, clearForm] = useLocalStorage(baseKey ? `${baseKey}_form` : null, {
    name: '',
    startDateTime: '',
    endDateTime: '',
    description: '',
    instructions: '',
    targetAudience: 'student',
    status: 'draft',
    isTimed: false,
    timeLimitMinutes: 180,
    passingThreshold: 70,
  });

  const isAlumniExam = (form.targetAudience || 'student') === 'alumni';

  const computedDuration = useMemo(() => {
    if (!form.startDateTime || !form.endDateTime) return null;
    const start = new Date(form.startDateTime);
    const end = new Date(form.endDateTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diffMins = Math.round((end - start) / 60000);
    if (diffMins < 0) return 'Invalid (End is before Start)';
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hrs} hours ${mins} minutes`;
  }, [form.startDateTime, form.endDateTime]);

  useEffect(() => {
    async function fetchPrograms() {
      setLoadingPrograms(true);
      try {
        const data = await apiAuth(`${BASE}/api/catalog/programs`);
        const deptId = me?.department?._id || me?.department;
        const deptPrograms = (data.programs || []).filter((program) => {
          const programDept = program.department?._id || program.department;
          return String(programDept) === String(deptId);
        });
        setPrograms(deptPrograms);

        if (!editingExamId && deptPrograms.length === 1) setProgramId(deptPrograms[0]._id);

        let filtered = deptPrograms;

        if (me.role === 'program_chair') {
          const myProgramId = me?.program?._id || me?.program;
          filtered = deptPrograms.filter((program) => String(program._id) === String(myProgramId));
          setPrograms(filtered);

          if (filtered.length === 1) {
            setProgramId(filtered[0]._id);
          }
        }

      } catch (err) {
        console.error('Failed to load programs:', err);
      } finally {
        setLoadingPrograms(false);
      }
    }

    if (me?.department) fetchPrograms();
  }, [editingExamId, me]);

  useEffect(() => {
    async function loadExamForEdit() {
      if (!editingExamId) return;
      try {
        const data = await apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(editingExamId)}`);
        const exam = data.exam;
        const nextTagIds = (exam.subjectTags || []).map((tag) => tag._id || tag);
        const nextQuestions = (exam.questions || []).map((question) => ({
          ...question,
          tagId: question.tag?._id || question.tag,
        }));

        setProgramId(exam.program?._id || exam.program || '');
        setSelectedTagIds(nextTagIds);
        setSelectedQuestions(nextQuestions);
        setForm({
          name: exam.name || '',
          startDateTime: toLocalDateTimeInput(exam.startDateTime),
          endDateTime: toLocalDateTimeInput(exam.endDateTime),
          description: exam.description || '',
          instructions: exam.instructions || '',
          targetAudience: exam.targetAudience || 'student',
          status: exam.status || 'draft',
          isTimed: Boolean(exam.isTimed),
          timeLimitMinutes: exam.timeLimitMinutes || 180,
          passingThreshold: exam.passingThreshold || 70,
        });
      } catch (err) {
        setFeedbackModal({
          title: 'Unable to Load Exam',
          tone: 'danger',
          message: err.message || 'Failed to load mock board exam.',
        });
      }
    }

    loadExamForEdit();
  }, [editingExamId]);

  useEffect(() => {
    async function fetchSubjects() {
      if (!programId) {
        setSubjectOptions([]);
        setSelectedTagIds([]);
        return;
      }
      setLoadingSubjects(true);
      try {
        const data = await apiAuth(`${BASE}/api/tags?program=${encodeURIComponent(programId)}`);
        setSubjectOptions(data.tags || []);
      } catch (err) {
        console.error('Failed to load subjects:', err);
      } finally {
        setLoadingSubjects(false);
      }
    }

    fetchSubjects();
  }, [programId]);

  useEffect(() => {
    async function fetchApprovedQuestions() {
      if (!programId || selectedTagIds.length === 0) {
        setApprovedQuestions([]);
        setSelectedQuestions((prev) => prev.filter((question) => selectedTagIds.includes(question.tag?._id || question.tagId || question.tag)));
        return;
      }

      setLoadingQuestions(true);
      try {
        const params = new URLSearchParams({
          program: programId,
          tags: selectedTagIds.join(','),
          states: 'approved'
        });
        const data = await apiAuth(`${BASE}/api/mock-board-exams/approved-questions?${params.toString()}`);
        setApprovedQuestions(data.questions || []);
      } catch (err) {
        console.error('Failed to load approved questions:', err);
      } finally {
        setLoadingQuestions(false);
      }
    }

    fetchApprovedQuestions();
  }, [programId, selectedTagIds]);

  useEffect(() => {
    setSelectedQuestions((prev) =>
      prev.filter((question) => {
        const questionTagId = question.tag?._id || question.tagId || question.tag;
        return selectedTagIds.length === 0 || selectedTagIds.includes(String(questionTagId));
      })
    );
  }, [selectedTagIds]);

  const selectedQuestionIds = useMemo(
    () => new Set(selectedQuestions.map((question) => String(question._id))),
    [selectedQuestions]
  );

  const filteredApprovedQuestions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return approvedQuestions
      .map((question) => organizeQuestionAnswers(question))
      .filter((question) => {
        const matchesSearch = !needle || [question.title, question.description, question.tag?.name, question.createdBy?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle);

        const questionTagId = String(question.tag?._id || question.tagId || question.tag || '');
        const matchesTag = !questionFilterTagId || questionTagId === String(questionFilterTagId);
        const isSelected = selectedQuestionIds.has(String(question._id));
        const matchesSelection =
          approvedSelectionFilter === 'all' ||
          (approvedSelectionFilter === 'selected' && isSelected) ||
          (approvedSelectionFilter === 'unselected' && !isSelected);

        const matchesState = questionStateFilter === 'all' || question.state === questionStateFilter;

        return matchesSearch && matchesTag && matchesSelection && matchesState;
      });
  }, [approvedQuestions, approvedSelectionFilter, questionFilterTagId, searchQuery, selectedQuestionIds, questionStateFilter]);

  const filteredSubjectOptions = useMemo(
    () => subjectOptions.filter((tag) => selectedTagIds.includes(String(tag._id))),
    [selectedTagIds, subjectOptions]
  );

  const filteredSelectedQuestions = useMemo(
    () =>
      selectedQuestions.filter((question) => {
        const questionTagId = String(question.tag?._id || question.tagId || question.tag || '');
        return !selectedQuestionFilterTagId || questionTagId === String(selectedQuestionFilterTagId);
      }),
    [selectedQuestionFilterTagId, selectedQuestions]
  );

  useEffect(() => {
    if (!questionFilterTagId) return;
    const stillExists = filteredSubjectOptions.some((tag) => String(tag._id) === String(questionFilterTagId));
    if (!stillExists) setQuestionFilterTagId('');
  }, [filteredSubjectOptions, questionFilterTagId]);

  useEffect(() => {
    if (!selectedQuestionFilterTagId) return;
    const stillExists = filteredSubjectOptions.some((tag) => String(tag._id) === String(selectedQuestionFilterTagId));
    if (!stillExists) setSelectedQuestionFilterTagId('');
  }, [filteredSubjectOptions, selectedQuestionFilterTagId]);

  function handleTagChange(tagId) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((item) => item !== tagId) : [...prev, tagId]
    );
  }

  function resolveImageUrl(image) {
    return image?.startsWith('/') ? `${BASE}${image}` : image;
  }

  function handleQuestionToggle(question) {
    const id = String(question._id);
    setSelectedQuestions((prev) => {
      if (prev.some((item) => String(item._id) === id)) {
        return prev.filter((item) => String(item._id) !== id);
      }
      return [...prev, question];
    });
  }

  function handleReturnQuestion(question) {
    setReturnModal(question);
    setReturnNote(feedbackByQuestionId[question._id] || '');
    setReturnError('');
  }

  function toggleQuestionExpanded(questionId) {
    setExpandedQuestionIds((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  }

  async function submitReturnQuestion() {
    if (!returnModal) return;
    if (!returnNote.trim()) {
      setReturnError('Please enter feedback before returning this question.');
      return;
    }

    setReturnSubmitting(true);
    setReturnError('');
    try {
      await apiAuth(`${BASE}/api/questions/${returnModal._id}/dean-return`, {
        method: 'POST',
        body: { note: returnNote.trim() },
      });
      setFeedbackByQuestionId((prev) => ({ ...prev, [returnModal._id]: returnNote.trim() }));
      setApprovedQuestions((prev) => prev.filter((item) => item._id !== returnModal._id));
      setSelectedQuestions((prev) => prev.filter((item) => item._id !== returnModal._id));
      setReturnModal(null);
      setReturnNote('');
    } catch (err) {
      setReturnError(err.message || 'Failed to return question.');
      setFeedbackModal({
        title: 'Return Failed',
        tone: 'danger',
        message: err.message || 'Failed to return question.',
      });
    } finally {
      setReturnSubmitting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        programId,
        subjectTagIds: selectedTagIds,
        questionIds: selectedQuestions.map((question) => question._id),
        startDateTime: ensureISOString(form.startDateTime),
        endDateTime: ensureISOString(form.endDateTime),
        description: form.description,
        instructions: form.instructions,
        targetAudience: form.targetAudience || 'student',
        status: editingExamId ? (form.status || 'draft') : 'draft',
        isTimed: isAlumniExam ? Boolean(form.isTimed) : false,
        timeLimitMinutes: isAlumniExam && form.isTimed ? Number(form.timeLimitMinutes) : null,
        passingThreshold: form.passingThreshold,
      };

      if (editingExamId) {
        await apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(editingExamId)}`, {
          method: 'PATCH',
          body: payload,
        });
      } else {
        await apiAuth(`${BASE}/api/mock-board-exams`, {
          method: 'POST',
          body: payload,
        });
      }

      clearForm();
      clearTagIds();
      clearQuestions();
      clearProgramId();

      setForm({
        name: '',
        startDateTime: '',
        endDateTime: '',
        description: '',
        instructions: '',
        targetAudience: 'student',
        status: 'draft',
        isTimed: false,
        timeLimitMinutes: 180,
        passingThreshold: 70,
      });
      setSelectedTagIds([]);
      setApprovedQuestions([]);
      setSelectedQuestions([]);
      if (programs.length === 1) setProgramId(programs[0]._id);
      else setProgramId('');
      if (onClearEditing) onClearEditing();
      if (onExamSaved) onExamSaved();
      setFeedbackModal({
        title: editingExamId ? 'Mock Board Exam Updated' : 'Mock Board Exam Created',
        tone: 'success',
        message: editingExamId
          ? 'Your changes were saved successfully.'
          : 'The mock board exam was created successfully.',
      });
    } catch (err) {
      setFeedbackModal({
        title: 'Save Failed',
        tone: 'danger',
        message: err.message || 'Failed to save mock board exam.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mbe-page">
      <PageHeader
        className="shared-page-header--bleed"
        title="Mock Board Exam"
        subtitle="Create a mock board exam by selecting the program first, then the subjects, then the approved questions."
      />

      <form className="mbe-form" onSubmit={handleSubmit}>
        <section className="mbe-card mbe-form-card">
          <div className="mbe-section-heading">
            <div>
              <h2>{editingExamId ? 'Edit Mock Board Exam' : 'Create Mock Board Exam'}</h2>
              <p>
                {isAlumniExam
                  ? 'Create a reusable alumni practice exam with a scheduled opening and closing time and decide if each attempt should be timed.'
                  : 'Create a student exam with a scheduled opening and closing time.'}
              </p>
            </div>
            <span className={`mbe-status-pill mbe-status-pill--${form.status}`}>
              {getStatusLabel(form.status)}
            </span>
          </div>

          <div className="mbe-form-grid">
            <div className="mbe-field">
              <label>
                Exam Name
                <input
                  className="mbe-input"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </label>
            </div>

            <div className="mbe-field">
              <label>
                Target Audience
                <select
                  className="mbe-input"
                  value={form.targetAudience || 'student'}
                  onChange={(e) => {
                    const targetAudience = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      targetAudience,
                      isTimed: targetAudience === 'alumni' ? prev.isTimed : false,
                      timeLimitMinutes: prev.timeLimitMinutes || 180,
                    }));
                  }}
                  required
                >
                  <option value="student">Students</option>
                  <option value="alumni">Alumni</option>
                </select>
              </label>
            </div>

            <div className="mbe-field">
              <label>
                Program
                <select
                  className="mbe-input"
                  value={programId}
                  onChange={(e) => {
                    setProgramId(e.target.value);
                    setSelectedTagIds([]);
                    setSelectedQuestions([]);
                  }}
                  required
                  disabled={loadingPrograms || me.role === 'program_chair'}
                >
                  <option value="">Select a program</option>
                  {programs.map((program) => (
                    <option key={program._id} value={program._id}>
                      {program.name} {program.code ? `(${program.code})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mbe-field">
              <div className="mbe-field-heading">
                <label>Exam Start</label>
              </div>
              <DateTimePicker
                value={form.startDateTime}
                onChange={(val) => setForm((prev) => ({ ...prev, startDateTime: val }))}
              />
            </div>

            <div className="mbe-field">
              <div className="mbe-field-heading">
                <label>Exam End</label>
                <span className={`mbe-field-meta ${computedDuration?.includes('Invalid') ? 'is-error' : ''}`}>
                  {computedDuration ? `Duration: ${computedDuration}` : '\u00A0'}
                </span>
              </div>
              <DateTimePicker
                value={form.endDateTime}
                onChange={(val) => setForm((prev) => ({ ...prev, endDateTime: val }))}
              />
            </div>

            {isAlumniExam && (
              <div className="mbe-field mbe-field--full">
                <div className="mbe-alumni-settings">
                  <div>
                    <h3>Alumni Attempt Timer</h3>
                    <p>This alumni exam becomes available when published and its schedule starts, and stays open until it ends, is archived or unpublished.</p>
                  </div>

                  <label className="mbe-check-row">
                    <input
                      type="checkbox"
                      checked={Boolean(form.isTimed)}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        isTimed: e.target.checked,
                        timeLimitMinutes: prev.timeLimitMinutes || 180,
                      }))}
                    />
                    <span>Make each alumni attempt timed</span>
                  </label>

                  {form.isTimed ? (
                    <label className="mbe-timer-field">
                      Time Limit (minutes)
                      <input
                        className="mbe-input"
                        type="number"
                        min="1"
                        step="1"
                        value={form.timeLimitMinutes}
                        onChange={(e) => setForm((prev) => ({ ...prev, timeLimitMinutes: e.target.value }))}
                        required
                      />
                      <span className="mbe-field-meta">
                        {formatDurationFromMinutes(form.timeLimitMinutes) || 'Enter the allowed attempt time.'}
                      </span>
                    </label>
                  ) : (
                    <p className="mbe-availability-note">Attempts will be untimed.</p>
                  )}
                </div>
              </div>
            )}

            <div className="mbe-field">
              <label>
                Passing Threshold (%)
                <input
                  className="mbe-input"
                  type="number"
                  min="0"
                  max="100"
                  value={form.passingThreshold}
                  onChange={(e) => setForm((prev) => ({ ...prev, passingThreshold: Number(e.target.value) }))}
                  required
                />
              </label>
            </div>

            <div className="mbe-field mbe-field--full mbe-textarea-grid">
              <label>
                Description
                <textarea
                  className="mbe-input mbe-textarea"
                  rows="4"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="General description of the exam..."
                />
              </label>
              <label>
                Instructions
                <textarea
                  className="mbe-input mbe-textarea"
                  rows="4"
                  value={form.instructions}
                  onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))}
                  placeholder="Exam instructions for students..."
                />
              </label>
            </div>
          </div>
        </section>

        <section className="mbe-card mbe-selection-card">
          <div className="mbe-section-heading">
            <div>
              <h2>Subjects</h2>
              <p>Choose the subject areas that will be included in this exam.</p>
            </div>
            <span className="mbe-count-pill">{selectedTagIds.length} selected</span>
          </div>

          {!programId ? <p className="mbe-empty-message">Select a program first before choosing subjects.</p> : null}
          {programId && loadingSubjects ? <p className="mbe-empty-message">Loading subjects...</p> : null}
          {programId && !loadingSubjects && subjectOptions.length === 0 ? <p className="mbe-empty-message">No subjects found for this program.</p> : null}
          {programId && !loadingSubjects && subjectOptions.length > 0 ? (
            <div className="mbe-tag-grid">
              {subjectOptions.map((tag) => (
                <label key={tag._id} className="mbe-tag-option">
                  <input
                    type="checkbox"
                    checked={selectedTagIds.includes(String(tag._id))}
                    onChange={() => handleTagChange(String(tag._id))}
                  />
                  <span>{tag.name}</span>
                </label>
              ))}
            </div>
          ) : null}
        </section>

        <section className="mbe-card mbe-table-card">
          <div className="mbe-section-heading">
            <div>
              <h2>Approved Questions</h2>
              <p>Browse each approved question as a preview card, then add the best ones to your exam.</p>
            </div>
            <span className="mbe-count-pill">{selectedQuestions.length} picked</span>
          </div>

          {!programId ? <p className="mbe-empty-message">Select a program first.</p> : null}
          {programId && selectedTagIds.length === 0 ? <p className="mbe-empty-message">Select at least one subject to show approved questions.</p> : null}
          {programId && selectedTagIds.length > 0 ? (
            <>
              <div className="mbe-toolbar">
                <input
                  className="mbe-input mbe-search"
                  type="text"
                  placeholder="Search approved question"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <select
                  className="mbe-input mbe-filter-select"
                  value={questionFilterTagId}
                  onChange={(e) => setQuestionFilterTagId(e.target.value)}
                >
                  <option value="">All selected subjects</option>
                  {filteredSubjectOptions.map((tag) => (
                    <option key={tag._id} value={tag._id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
                <select
                  className="mbe-input mbe-filter-select"
                  value={approvedSelectionFilter}
                  onChange={(e) => setApprovedSelectionFilter(e.target.value)}
                >
                  <option value="all">All questions</option>
                  <option value="selected">Selected only</option>
                  <option value="unselected">Not selected yet</option>
                </select>
                <div className="mbe-toolbar-stats">
                  <span className="mbe-toolbar-pill">{filteredApprovedQuestions.length} available</span>
                  <span className="mbe-toolbar-pill mbe-toolbar-pill--selected">{selectedQuestions.length} selected</span>
                </div>
              </div>

              {loadingQuestions ? <p className="mbe-empty-message">Loading approved questions...</p> : null}
              {!loadingQuestions && filteredApprovedQuestions.length === 0 ? <p className="mbe-empty-message">No approved questions match the selected subjects.</p> : null}
              {!loadingQuestions && filteredApprovedQuestions.length > 0 ? (
                <div className="mbe-approved-stack">
                  {filteredApprovedQuestions.map((question) => {
                    const isSelected = selectedQuestionIds.has(String(question._id));
                    const imageCount = question.images?.length || 0;
                    const answerCount = question.answers?.length || 0;
                    const isExpanded = !!expandedQuestionIds[question._id];

                    return (
                      <article
                        key={question._id}
                        className={`mbe-question-card mbe-question-card--stack ${isSelected ? 'is-selected' : ''}`}
                      >
                        <div className="mbe-question-main">
                          <button
                            type="button"
                            className="mbe-question-copy mbe-question-toggle"
                            onClick={() => toggleQuestionExpanded(question._id)}
                            aria-expanded={isExpanded}
                          >
                            <div className="mbe-question-meta-row">
                              <span className="mbe-subject-pill">{question.tag?.name || 'No subject'}</span>
                              <span className="mbe-meta-text">{answerCount} answers | {imageCount} images</span>
                              {question.createdBy?.name ? (
                                <span className="mbe-meta-text">By {question.createdBy.name}</span>
                              ) : null}
                              <span className={`mbe-expand-icon ${isExpanded ? 'is-open' : ''}`} aria-hidden="true">▾</span>
                            </div>

                            <div className="mbe-question-headline mbe-question-headline--compact">
                              <h3>
                                {question.title}
                              </h3>
                            </div>
                          </button>

                          <div className="mbe-question-actions">
                            <button
                              className={`mbe-select-btn ${isSelected ? 'is-selected' : ''}`}
                              type="button"
                              onClick={() => handleQuestionToggle(question)}
                            >
                              {isSelected ? 'Added' : 'Add'}
                            </button>
                            {!question.is_used_in_exam && (
                              <button
                                className="mbe-btn mbe-btn-ghost mbe-btn-small"
                                type="button"
                                onClick={() => handleReturnQuestion(question)}
                              >
                                Return
                              </button>
                            )}
                          </div>
                        </div>

                        {isExpanded ? (
                          <div className="mbe-question-details">
                            <section className="mbe-question-panel">
                              <p className="mbe-panel-label">Question</p>
                              <p className="mbe-question-description">{question.description || 'No description provided.'}</p>
                            </section>

                            {imageCount > 0 ? (
                              <section className="mbe-question-panel">
                                <p className="mbe-panel-label">Images</p>
                                <div className="mbe-preview-images">
                                  {question.images.map((image, index) => (
                                    <button
                                      key={index}
                                      type="button"
                                      className="mbe-preview-image-link"
                                      onClick={() => setFullscreenImage(resolveImageUrl(image))}
                                    >
                                      <img
                                        className="mbe-preview-image"
                                        src={resolveImageUrl(image)}
                                        alt={`${question.title} image ${index + 1}`}
                                      />
                                    </button>
                                  ))}
                                </div>
                              </section>
                            ) : null}

                            <section className="mbe-question-panel">
                              <p className="mbe-panel-label">Answers</p>
                              <ul className="mbe-answer-list mbe-answer-list--cards">
                                {(question.answers || []).map((answer) => (
                                  <li key={answer._id || answer.text} className={answer.isCorrect ? 'is-correct' : ''}>
                                    <span className="mbe-answer-label">{answer.optionLabel}</span>
                                    <span>{answer.text}</span>
                                    {answer.isCorrect ? <strong>Correct</strong> : null}
                                  </li>
                                ))}
                              </ul>
                            </section>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="mbe-card mbe-table-card">
          <div className="mbe-section-heading">
            <div>
              <h2>Selected Questions</h2>
              <p>Questions currently included in this mock board exam, shown as a clean audit view.</p>
            </div>
            <span className="mbe-count-pill">{selectedQuestions.length} total</span>
          </div>

          {selectedQuestions.length === 0 ? <p className="mbe-empty-message">No questions selected yet.</p> : null}
          {selectedQuestions.length > 0 ? (
            <>
              <div className="mbe-toolbar mbe-toolbar--selected">
                <select
                  className="mbe-input mbe-filter-select"
                  value={selectedQuestionFilterTagId}
                  onChange={(e) => setSelectedQuestionFilterTagId(e.target.value)}
                >
                  <option value="">All selected subjects</option>
                  {filteredSubjectOptions.map((tag) => (
                    <option key={tag._id} value={tag._id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mbe-table-wrap">
                <table className="mbe-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Question Title</th>
                      <th>Subject</th>
                      <th>Choices</th>
                      <th>Images</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSelectedQuestions.length > 0 ? (
                      filteredSelectedQuestions.map((question, index) => (
                        <tr key={question._id}>
                          <td>{index + 1}</td>
                          <td className="mbe-table-title-cell">{question.title}</td>
                          <td>
                            <span className="mbe-subject-pill">{question.tag?.name || '-'}</span>
                          </td>
                          <td>{question.answers?.length || 0}</td>
                          <td>{question.images?.length || 0}</td>
                          <td>
                            <button className="mbe-btn mbe-btn-danger mbe-btn-small" type="button" onClick={() => handleQuestionToggle(question)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="mbe-table-empty">No selected questions match this subject.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>

        {fullscreenImage ? (
          <div className="mbe-image-overlay" onClick={() => setFullscreenImage(null)}>
            <div className="mbe-image-modal" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="mbe-image-close"
                onClick={() => setFullscreenImage(null)}
              >
                Close
              </button>
              <img src={fullscreenImage} alt="Question preview" className="mbe-image-full" />
            </div>
          </div>
        ) : null}

        <section className="mbe-actions">
          <button className="mbe-btn mbe-btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : editingExamId ? 'Update Mock Board Exam' : 'Create Mock Board Exam'}
          </button>
          {editingExamId ? (
            <button className="mbe-btn mbe-btn-ghost" type="button" onClick={onClearEditing}>
              Cancel Edit
            </button>
          ) : null}
        </section>
      </form>

      <FeedbackModal
        open={!!feedbackModal}
        onClose={() => setFeedbackModal(null)}
        title={feedbackModal?.title || 'Notification'}
        tone={feedbackModal?.tone || 'info'}
        message={feedbackModal?.message}
      />

      <Modal
        open={!!returnModal}
        onClose={() => {
          if (returnSubmitting) return;
          setReturnModal(null);
          setReturnNote('');
          setReturnError('');
        }}
        title="Return Question with Feedback"
        size="compact"
        bodyClassName="custom-modal-body--compact"
      >
        <div className="modal-confirmation">
          <div className="modal-confirmation-message">
            <p><strong>Question:</strong> {returnModal?.title}</p>
          </div>

          <div className="modal-form-group">
            <label>Feedback (required)</label>
            <textarea
              className="modal-textarea"
              rows="5"
              value={returnNote}
              onChange={(e) => {
                setReturnNote(e.target.value);
                if (returnError) setReturnError('');
              }}
              placeholder="Explain why this question is being returned..."
              autoFocus
            />
          </div>
        </div>

        {returnError ? <p className="modal-error">{returnError}</p> : null}

        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={() => {
              setReturnModal(null);
              setReturnNote('');
              setReturnError('');
            }}
            disabled={returnSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn-primary"
            onClick={submitReturnQuestion}
            disabled={returnSubmitting || !returnNote.trim()}
          >
            {returnSubmitting ? 'Submitting...' : 'Return Question'}
          </button>
        </div>
      </Modal>
    </main>
  );
}
