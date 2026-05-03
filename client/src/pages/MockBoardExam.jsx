import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import { organizeQuestionAnswers } from '../lib/DeanTestRunOrganizer.js';
import DateTimePicker from '../components/DateTimePicker.jsx';
import '../styles/MockBoardExam.css';

const BASE = 'http://localhost:5000';

function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export default function MockBoardExam({ me, editingExamId, onExamSaved, onClearEditing }) {
  const [programs, setPrograms] = useState([]);
  const [programId, setProgramId] = useState('');
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [approvedQuestions, setApprovedQuestions] = useState([]);
  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackByQuestionId, setFeedbackByQuestionId] = useState({});
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [questionFilterTagId, setQuestionFilterTagId] = useState('');
  const [approvedSelectionFilter, setApprovedSelectionFilter] = useState('all');
  const [selectedQuestionFilterTagId, setSelectedQuestionFilterTagId] = useState('');
  const [form, setForm] = useState({
    name: '',
    examDate: '',
    duration: 150,
    description: '',
    instructions: '',
    status: 'draft',
  });

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
          examDate: toLocalDateTimeInput(exam.examDate || exam.availabilityStart),
          duration: exam.duration || 150,
          description: exam.description || '',
          instructions: exam.instructions || '',
          status: exam.status || 'draft',
        });
      } catch (err) {
        alert(err.message || 'Failed to load mock board exam.');
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

        return matchesSearch && matchesTag && matchesSelection;
      });
  }, [approvedQuestions, approvedSelectionFilter, questionFilterTagId, searchQuery, selectedQuestionIds]);

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

  async function handleReturnQuestion(question) {
    const existing = feedbackByQuestionId[question._id] || '';
    const note = window.prompt('Return this approved question with feedback', existing);
    if (note === null) return;
    if (!note.trim()) {
      alert('Feedback is required.');
      return;
    }

    try {
      await apiAuth(`${BASE}/api/questions/${question._id}/dean-return`, {
        method: 'POST',
        body: { note: note.trim() },
      });
      setFeedbackByQuestionId((prev) => ({ ...prev, [question._id]: note.trim() }));
      setApprovedQuestions((prev) => prev.filter((item) => item._id !== question._id));
      setSelectedQuestions((prev) => prev.filter((item) => item._id !== question._id));
    } catch (err) {
      alert(err.message || 'Failed to return question.');
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
        examDate: form.examDate,
        duration: form.duration,
        description: form.description,
        instructions: form.instructions,
        status: form.status,
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

      setForm({
        name: '',
        examDate: '',
        duration: 150,
        description: '',
        instructions: '',
        status: 'draft',
      });
      setSelectedTagIds([]);
      setApprovedQuestions([]);
      setSelectedQuestions([]);
      if (programs.length === 1) setProgramId(programs[0]._id);
      else setProgramId('');
      if (onClearEditing) onClearEditing();
      if (onExamSaved) onExamSaved();
      alert(editingExamId ? 'Mock board exam updated.' : 'Mock board exam created.');
    } catch (err) {
      alert(err.message || 'Failed to save mock board exam.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mbe-page">
      <header className="mbe-page-header">
        <h1>Mock Board Exam</h1>
        <p>Create a mock board exam by selecting the program first, then the subjects, then the approved questions.</p>
      </header>

      <form className="mbe-form" onSubmit={handleSubmit}>
        <section className="mbe-card mbe-form-card">
          <div className="mbe-section-heading">
            <div>
              <h2>{editingExamId ? 'Edit Mock Board Exam' : 'Create Mock Board Exam'}</h2>
              <p>Set the exam details, availability, and publishing status.</p>
            </div>
            <span className={`mbe-status-pill mbe-status-pill--${form.status}`}>
              {form.status}
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
                  disabled={loadingPrograms}
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
              <label>Exam Date</label>
              <DateTimePicker
                value={form.examDate}
                onChange={(val) => setForm((prev) => ({ ...prev, examDate: val }))}
              />
            </div>

            <div className="mbe-field">
              <label>
                Duration (Minutes)
                <input
                  className="mbe-input"
                  type="number"
                  min="1"
                  value={form.duration}
                  onChange={(e) => setForm((prev) => ({ ...prev, duration: e.target.value }))}
                  required
                />
              </label>
            </div>

            <div className="mbe-field">
              <label>
                Status
                <select
                  className="mbe-input"
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
            </div>

            <div className="mbe-field mbe-field--full" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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

                    return (
                      <article
                        key={question._id}
                        className={`mbe-question-card mbe-question-card--stack ${isSelected ? 'is-selected' : ''}`}
                      >
                        <div className="mbe-question-main">
                          <div className="mbe-question-copy">
                            <div className="mbe-question-meta-row">
                              <span className="mbe-subject-pill">{question.tag?.name || 'No subject'}</span>
                              <span className="mbe-meta-text">{answerCount} answers | {imageCount} images</span>
                              {question.createdBy?.name ? (
                                <span className="mbe-meta-text">By {question.createdBy.name}</span>
                              ) : null}
                            </div>

                            <div className="mbe-question-headline mbe-question-headline--compact">
                              <h3>{question.title}</h3>
                              <p>{question.description || 'No description provided.'}</p>
                            </div>

                            {imageCount > 0 ? (
                              <div className="mbe-question-thumbs">
                                {question.images.slice(0, 3).map((image, index) => (
                                  <button
                                    key={index}
                                    type="button"
                                    className="mbe-question-thumb-link"
                                    onClick={() => setFullscreenImage(resolveImageUrl(image))}
                                  >
                                    <img
                                      className="mbe-question-thumb"
                                      src={resolveImageUrl(image)}
                                      alt={`${question.title} thumbnail ${index + 1}`}
                                    />
                                  </button>
                                ))}
                                {imageCount > 3 ? (
                                  <span className="mbe-thumb-more">+{imageCount - 3} more</span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>

                          <div className="mbe-question-actions">
                            <button
                              className={`mbe-select-btn ${isSelected ? 'is-selected' : ''}`}
                              type="button"
                              onClick={() => handleQuestionToggle(question)}
                            >
                              {isSelected ? 'Added' : 'Add'}
                            </button>
                            <button
                              className="mbe-btn mbe-btn-ghost mbe-btn-small"
                              type="button"
                              onClick={() => handleReturnQuestion(question)}
                            >
                              Return
                            </button>
                          </div>
                        </div>

                        <div className="mbe-question-details">
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
    </main>
  );
}
