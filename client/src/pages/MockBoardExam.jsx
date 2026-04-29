import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../lib/api.js';

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
  const [form, setForm] = useState({
    name: '',
    availabilityStart: '',
    availabilityEnd: '',
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
          availabilityStart: toLocalDateTimeInput(exam.availabilityStart),
          availabilityEnd: toLocalDateTimeInput(exam.availabilityEnd),
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

  const filteredApprovedQuestions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return approvedQuestions.filter((question) => {
      if (!needle) return true;
      return [question.title, question.description, question.tag?.name, question.createdBy?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [approvedQuestions, searchQuery]);

  const selectedQuestionIds = useMemo(
    () => new Set(selectedQuestions.map((question) => String(question._id))),
    [selectedQuestions]
  );

  function handleTagChange(tagId) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((item) => item !== tagId) : [...prev, tagId]
    );
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
        availabilityStart: form.availabilityStart,
        availabilityEnd: form.availabilityEnd || null,
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
        availabilityStart: '',
        availabilityEnd: '',
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
    <main>
      <h1>Mock Board Exam</h1>
      <p>Create a mock board exam by selecting the program first, then the subjects, then the approved questions.</p>

      <form onSubmit={handleSubmit}>
        <section>
          <h2>{editingExamId ? 'Edit Mock Board Exam' : 'Create Mock Board Exam'}</h2>
          <div>
            <label>
              Exam Name
              <br />
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </label>
          </div>
          <div>
            <label>
              Program
              <br />
              <select
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
          <div>
            <label>
              Availability Start
              <br />
              <input
                type="datetime-local"
                value={form.availabilityStart}
                onChange={(e) => setForm((prev) => ({ ...prev, availabilityStart: e.target.value }))}
                required
              />
            </label>
          </div>
          <div>
            <label>
              Availability End
              <br />
              <input
                type="datetime-local"
                value={form.availabilityEnd}
                onChange={(e) => setForm((prev) => ({ ...prev, availabilityEnd: e.target.value }))}
              />
            </label>
          </div>
          <div>
            <label>
              Status
              <br />
              <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <div>
            <label>
              Instructions
              <br />
              <textarea
                rows="4"
                value={form.instructions}
                onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))}
                placeholder="Optional exam instructions"
              />
            </label>
          </div>
        </section>

        <section>
          <h2>Subjects</h2>
          {!programId ? <p>Select a program first before choosing subjects.</p> : null}
          {programId && loadingSubjects ? <p>Loading subjects...</p> : null}
          {programId && !loadingSubjects && subjectOptions.length === 0 ? <p>No subjects found for this program.</p> : null}
          {programId && !loadingSubjects && subjectOptions.length > 0 ? (
            <div>
              {subjectOptions.map((tag) => (
                <label key={tag._id} style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={selectedTagIds.includes(String(tag._id))}
                    onChange={() => handleTagChange(String(tag._id))}
                  />{' '}
                  {tag.name}
                </label>
              ))}
            </div>
          ) : null}
        </section>

        <section>
          <h2>Approved Questions</h2>
          {!programId ? <p>Select a program first.</p> : null}
          {programId && selectedTagIds.length === 0 ? <p>Select at least one subject to show approved questions.</p> : null}
          {programId && selectedTagIds.length > 0 ? (
            <>
              <input
                type="text"
                placeholder="Search approved question"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {loadingQuestions ? <p>Loading approved questions...</p> : null}
              {!loadingQuestions && filteredApprovedQuestions.length === 0 ? <p>No approved questions match the selected subjects.</p> : null}
              {!loadingQuestions && filteredApprovedQuestions.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Add</th>
                      <th>Question Title</th>
                      <th>Description</th>
                      <th>Subject</th>
                      <th>Images</th>
                      <th>Answers</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApprovedQuestions.map((question) => (
                      <tr key={question._id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedQuestionIds.has(String(question._id))}
                            onChange={() => handleQuestionToggle(question)}
                          />
                        </td>
                        <td>{question.title}</td>
                        <td>{question.description}</td>
                        <td>{question.tag?.name || '-'}</td>
                        <td>
                          {question.images?.length ? (
                            <ul>
                              {question.images.map((image, index) => (
                                <li key={index}>
                                  <a href={image.startsWith('/') ? `${BASE}${image}` : image} target="_blank" rel="noreferrer">
                                    Image {index + 1}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            'No image'
                          )}
                        </td>
                        <td>
                          <ul>
                            {(question.answers || []).map((answer) => (
                              <li key={answer._id || answer.text}>
                                {answer.text} {answer.isCorrect ? '(Correct)' : ''}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td>
                          <button type="button" onClick={() => handleReturnQuestion(question)}>
                            Return with Feedback
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </>
          ) : null}
        </section>

        <section>
          <h2>Selected Questions</h2>
          <p>Total selected questions: {selectedQuestions.length}</p>
          {selectedQuestions.length === 0 ? <p>No questions selected yet.</p> : null}
          {selectedQuestions.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Question Title</th>
                  <th>Subject</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {selectedQuestions.map((question) => (
                  <tr key={question._id}>
                    <td>{question.title}</td>
                    <td>{question.tag?.name || '-'}</td>
                    <td>
                      <button type="button" onClick={() => handleQuestionToggle(question)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>

        <section>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : editingExamId ? 'Update Mock Board Exam' : 'Create Mock Board Exam'}
          </button>{' '}
          {editingExamId ? (
            <button type="button" onClick={onClearEditing}>
              Cancel Edit
            </button>
          ) : null}
        </section>
      </form>
    </main>
  );
}
