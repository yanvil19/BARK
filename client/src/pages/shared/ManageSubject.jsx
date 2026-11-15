import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiAuth } from '../../lib/api.js';
import AuthImage from '../../components/AuthImage.jsx';
import { Modal } from '../../components/Modal.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import Pagination from '../../components/Pagination.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import SearchBar from '../../components/SearchBar.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import TrashButton from '../../components/TrashButton.jsx';
import { useToast } from '../../components/Toast.jsx';
import { IconSubject } from '../../components/CalendarIcons.jsx';
import { ExamStatePill, StatePill } from '../../components/QuestionMarkers.jsx';
import { formatDateTime } from '../../utils/dateFormat.js';
import '../../styles/components/QuestionFilters.css';
import '../../styles/shared/SubjectTags.css';
import '../../styles/global.css';
// The subject window builds from the shared panel parts (sections, notes, the view toggle)
import '../../styles/shared/QuestionApprovals.css';
import QuestionStepper from '../../components/QuestionStepper.jsx';

const BASE = import.meta.env.VITE_API_URL;
// Twelve cards fill whole rows of two, three or four
const PAGE_SIZE = 12;

const WINDOW_VIEWS = [
  { value: 'questions', label: 'Questions' },
  { value: 'exams', label: 'Exams' },
];

const AUDIENCE_LABELS = { student: 'Students', alumni: 'Alumni' };

const NO_USAGE = { questions: [], exams: [] };

function formatCount(count, singular) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function getId(ref) {
  return String(ref?._id || ref || '');
}

// Each subject's questions, and the exams that list it or hold any of its questions
function buildUsageByTag(questions, exams) {
  const usageByTag = new Map();
  const usageOf = (tagId) => {
    if (!usageByTag.has(tagId)) usageByTag.set(tagId, { questions: [], exams: [] });
    return usageByTag.get(tagId);
  };

  const tagOfQuestion = new Map();
  questions.forEach((question) => {
    const tagId = getId(question.tag);
    if (!tagId) return;
    tagOfQuestion.set(question._id, tagId);
    usageOf(tagId).questions.push(question);
  });

  exams.forEach((exam) => {
    const questionCounts = new Map();
    (exam.questions || []).forEach((question) => {
      const tagId = tagOfQuestion.get(getId(question));
      if (tagId) questionCounts.set(tagId, (questionCounts.get(tagId) || 0) + 1);
    });
    const tagIds = new Set([...(exam.subjectTags || []).map((tag) => getId(tag)), ...questionCounts.keys()]);
    tagIds.forEach((tagId) => {
      usageOf(tagId).exams.push({ exam, questionCount: questionCounts.get(tagId) || 0 });
    });
  });

  return usageByTag;
}

// Loads a whole list once: the page works out each subject's share of it
function useWholeList(path, field, failureMessage) {
  const { notify } = useToast();
  const [list, setList] = useState({ loading: true, error: '', items: [] });

  useEffect(() => {
    let ignore = false;
    apiAuth(`${BASE}${path}`)
      .then((data) => {
        if (!ignore) setList({ loading: false, error: '', items: data[field] || [] });
      })
      .catch((err) => {
        if (ignore) return;
        const error = err.message || failureMessage;
        setList({ loading: false, error, items: [] });
        notify(error);
      });
    return () => {
      ignore = true;
    };
  }, [path, field, failureMessage, notify]);

  return list;
}

// The line under a card's question count
function describeQuestions(questions) {
  if (questions.length === 0) return 'None submitted yet';
  const approved = questions.filter((question) => question.state === 'approved').length;
  return `${approved} approved`;
}

// The line under a card's exam count: who the exams are for
function describeExams(exams) {
  if (exams.length === 0) return 'Not in an exam yet';
  const alumni = exams.filter(({ exam }) => exam.targetAudience === 'alumni').length;
  const students = exams.length - alumni;
  return [
    students > 0 && `${students} for students`,
    alumni > 0 && `${alumni} for alumni`,
  ].filter(Boolean).join(', ');
}

// One number on a subject card: what it counts, the count, and a line about it
function SubjectStat({ label, list, count, describe }) {
  const value = list.loading || list.error ? '-' : count;
  const sub = list.loading ? 'Loading...' : list.error ? 'Could not load' : describe();
  return (
    <div className="st-card-stat">
      <span className="st-card-stat-label">{label}</span>
      <strong className="st-card-stat-value">{value}</strong>
      <span className="st-card-stat-sub">{sub}</span>
    </div>
  );
}

export default function ManageSubject({ me }) {
  const isDean = me?.role === 'dean';
  const { notify } = useToast();
  const [tags, setTags] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [programId, setProgramId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  // The subject window: the open subject, Questions or Exams, the question shown, and the image
  // opened full size
  const [openTagId, setOpenTagId] = useState(null);
  const [windowView, setWindowView] = useState('questions');
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  // The add or edit window: { tag, name, error }, where tag is empty for a new subject
  const [subjectForm, setSubjectForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tagToDelete, setTagToDelete] = useState(null);
  const [feedbackModal, setFeedbackModal] = useState(null);

  // Drafts are left out: they stay private to whoever is writing them
  const questionList = useWholeList('/api/questions/approvals', 'questions', 'Questions could not be loaded. Please try again.');
  const examList = useWholeList('/api/mock-board-exams', 'exams', 'Exams could not be loaded. Please try again.');

  const usageByTag = useMemo(
    () => buildUsageByTag(questionList.items, examList.items),
    [questionList.items, examList.items],
  );
  const openTag = useMemo(
    () => (openTagId ? tags.find((tag) => tag._id === openTagId) || null : null),
    [tags, openTagId],
  );
  const openUsage = (openTag && usageByTag.get(openTag._id)) || NO_USAGE;

  useEffect(() => {
    if (!isDean) return;
    let ignore = false;
    setLoadingPrograms(true);
    apiAuth(`${BASE}/api/catalog/programs`)
      .then((data) => {
        if (ignore) return;
        const deptId = me?.department?._id || me?.department;
        const deptPrograms = (data.programs || []).filter((program) => {
          const programDept = program.department?._id || program.department;
          return String(programDept) === String(deptId);
        });
        setPrograms(deptPrograms);
        setProgramId((prev) => {
          if (prev && deptPrograms.some((program) => String(program._id) === String(prev))) return prev;
          if (deptPrograms.length === 1) return deptPrograms[0]._id;
          return '';
        });
      })
      .catch((err) => {
        if (!ignore) notify(err.message || 'Programs could not be loaded. Please try again.');
      })
      .finally(() => {
        if (!ignore) setLoadingPrograms(false);
      });
    return () => {
      ignore = true;
    };
  }, [isDean, me]);

  useEffect(() => {
    if (isDean && !programId) {
      setTags([]);
      setLoading(false);
      return undefined;
    }
    let ignore = false;
    setLoading(true);
    apiAuth(isDean ? `${BASE}/api/tags?program=${encodeURIComponent(programId)}` : `${BASE}/api/tags`)
      .then((data) => {
        if (!ignore) setTags(data.tags || []);
      })
      .catch((err) => {
        if (!ignore) notify(err.message || 'Subjects could not be loaded. Please try again.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [isDean, programId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, programId]);

  // The full-size image sits over the subject window. Escape closes the image first: caught before
  // the window's own Escape, so the window stays open.
  useEffect(() => {
    if (!fullscreenImage) return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setFullscreenImage(null);
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [fullscreenImage]);

  function changeProgram(nextProgramId) {
    setProgramId(nextProgramId);
    setOpenTagId(null);
    setSearchQuery('');
  }

  // Each subject opens on its questions, from the first
  function openSubject(tag) {
    setOpenTagId(tag._id);
    setWindowView('questions');
    setActiveQuestionIdx(0);
  }

  function updateSubjectForm(changes) {
    setSubjectForm((prev) => ({ ...prev, ...changes }));
  }

  async function handleSubmitSubject(event) {
    event.preventDefault();
    const { tag } = subjectForm;
    const name = subjectForm.name.trim();
    if (!name) {
      updateSubjectForm({ error: 'Subject name cannot be empty.' });
      return;
    }
    if (!tag && isDean && !programId) {
      updateSubjectForm({ error: 'Select a program first.' });
      return;
    }

    setSaving(true);
    try {
      const sortByName = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name));
      if (tag) {
        const data = await apiAuth(`${BASE}/api/tags/${tag._id}`, { method: 'PATCH', body: { name } });
        setTags((prev) => sortByName(prev.map((item) => (item._id === tag._id ? data.tag : item))));
        notify('Subject updated.', { variant: 'success' });
      } else {
        const body = isDean ? { name, programId } : { name };
        const data = await apiAuth(`${BASE}/api/tags`, { method: 'POST', body });
        setTags((prev) => sortByName([...prev, data.tag]));
        notify(`${data.tag.name} added.`, { variant: 'success' });
      }
      setSubjectForm(null);
    } catch (err) {
      updateSubjectForm({ error: err.message || 'The subject could not be saved.' });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!tagToDelete) return;
    setSaving(true);
    try {
      await apiAuth(`${BASE}/api/tags/${tagToDelete._id}`, { method: 'DELETE' });
      setTags((prev) => prev.filter((tag) => tag._id !== tagToDelete._id));
      if (openTagId === tagToDelete._id) setOpenTagId(null);
      setTagToDelete(null);
      notify('Subject deleted.', { variant: 'success' });
    } catch (err) {
      // The server also counts drafts, which this page can't see
      setTagToDelete(null);
      setFeedbackModal({
        title: 'Delete Failed',
        tone: 'danger',
        message: err.message || 'Failed to delete subject.',
      });
    } finally {
      setSaving(false);
    }
  }

  const search = searchQuery.toLowerCase().trim();
  const filteredTags = tags.filter((tag) => tag.name.toLowerCase().includes(search));
  const totalPages = Math.max(Math.ceil(filteredTags.length / PAGE_SIZE), 1);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedTags = filteredTags.slice(startIndex, startIndex + PAGE_SIZE);

  // Deleting can empty the last page
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const departmentLabel = me?.department?.name || 'Department';
  const examsUsingTagToDelete = tagToDelete ? (usageByTag.get(tagToDelete._id) || NO_USAGE).exams.length : 0;

  function renderSubjectCard(tag, cardIndex) {
    const usage = usageByTag.get(tag._id) || NO_USAGE;

    return (
      <article
        key={tag._id}
        className="st-card"
        style={{ '--card-index': cardIndex }}
        onClick={() => openSubject(tag)}
      >
        <header className="st-card-head">
          <span className="st-card-icon" aria-hidden="true">
            <IconSubject width="18" height="18" />
          </span>
          {/* Its click goes up to the card, so keyboard users can open the card too */}
          <h2 className="st-card-title">
            <button type="button" className="st-card-open" title={tag.name}>{tag.name}</button>
          </h2>
        </header>
        <div className="st-card-body">
          <SubjectStat
            label="Questions"
            list={questionList}
            count={usage.questions.length}
            describe={() => describeQuestions(usage.questions)}
          />
          <SubjectStat
            label="Exams"
            list={examList}
            count={usage.exams.length}
            describe={() => describeExams(usage.exams)}
          />
        </div>
      </article>
    );
  }

  function renderQuestionsView() {
    if (questionList.loading) return <p className="ca-panel-note">Loading questions...</p>;
    if (questionList.error) return <p className="ca-panel-note ca-panel-note--error" role="alert">{questionList.error}</p>;
    if (openUsage.questions.length === 0) {
      return <p className="ca-panel-note">No submitted questions use this subject yet. Drafts are not shown here.</p>;
    }

    return (
      <QuestionStepper
        questions={openUsage.questions}
        activeIdx={activeQuestionIdx}
        onSelectQuestion={setActiveQuestionIdx}
        onZoom={setFullscreenImage}
        renderAside={(question) => <StatePill state={question.state} />}
        renderDetails={(question) => (
          <section className="ca-section ca-review-metadata" key={`details-${question._id}`}>
            <div className="ca-meta-grid">
              <div>
                <span className="ca-meta-label">Professor</span>
                <div className="ca-meta-value">{question.createdBy?.name || 'Unknown'}</div>
              </div>
              <div>
                <span className="ca-meta-label">Submitted</span>
                <div className="ca-meta-value">{formatDateTime(question.submittedAt || question.createdAt)}</div>
              </div>
              <div>
                <span className="ca-meta-label">Last Edited By</span>
                <div className="ca-meta-value">
                  {question.lastEditedAt ? (question.lastEditedBy?.name || 'Unknown') : 'Not edited'}
                </div>
              </div>
              <div>
                <span className="ca-meta-label">Last Edited</span>
                <div className="ca-meta-value">{formatDateTime(question.lastEditedAt)}</div>
              </div>
            </div>
          </section>
        )}
      />
    );
  }

  function renderExamsView() {
    if (examList.loading) return <p className="ca-panel-note">Loading exams...</p>;
    if (examList.error) return <p className="ca-panel-note ca-panel-note--error" role="alert">{examList.error}</p>;
    if (openUsage.exams.length === 0) return <p className="ca-panel-note">No exam uses this subject yet.</p>;

    return (
      <section className="question-panel">
        <p className="question-panel-label">Exams Using This Subject ({openUsage.exams.length})</p>
        <ul className="st-exam-list">
          {openUsage.exams.map(({ exam, questionCount }) => (
            <li key={exam._id} className="st-exam-row">
              <div className="st-exam-text">
                <span className="st-exam-name">{exam.name}</span>
                <span className="st-exam-meta">
                  <span>{AUDIENCE_LABELS[exam.targetAudience || 'student']}</span>
                  <span>{questionCount} of {formatCount(exam.questions?.length || 0, 'question')} from this subject</span>
                  <span>{exam.startDateTime ? formatDateTime(exam.startDateTime) : 'Not scheduled'}</span>
                </span>
              </div>
              <ExamStatePill status={exam.status} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const hasQuestions = openUsage.questions.length > 0;
  const viewCounts = {
    questions: questionList.loading || questionList.error ? null : openUsage.questions.length,
    exams: examList.loading || examList.error ? null : openUsage.exams.length,
  };

  return (
    <main className="st-page page-shell">
      <PageHeader
        title="Manage Subjects"
        subtitle={isDean
          ? 'Create and manage subjects for programs under your department. Professors will use these subjects to categorize their questions.'
          : 'Create and manage subjects for your program. Professors will use these subjects to categorize their questions.'}
      >
        <div className="st-header-actions">
          {!isDean && <span className="ca-program-chip">{me?.program?.name || 'Your Program'}</span>}
          <button
            type="button"
            className="qp-btn-add"
            onClick={() => setSubjectForm({ tag: null, name: '', error: '' })}
            disabled={isDean && !programId}
          >
            + Add New Subject
          </button>
        </div>
      </PageHeader>

      <div className="qf-filters ca-filters-wrapper">
        <SearchBar
          className="qf-search"
          placeholder="Search subjects..."
          value={searchQuery}
          onChange={setSearchQuery}
          disabled={isDean && !programId}
        />
        {isDean && (
          <DropdownSelect
            className="qf-filter-select--program st-program-select"
            value={programId}
            onChange={(event) => changeProgram(event.target.value)}
            disabled={loadingPrograms}
            placeholder={`Select ${departmentLabel}`}
            options={programs.map((program) => ({
              value: program._id,
              label: `${program.name}${program.code ? ` (${program.code})` : ''}`,
            }))}
          />
        )}
      </div>

      {loading ? (
        <p className="st-notice">Loading subjects...</p>
      ) : filteredTags.length === 0 ? (
        <p className="st-notice">
          {isDean && !programId
            ? 'Select a program first to view its subjects.'
            : searchQuery
              ? `No subjects match "${searchQuery}"`
              : 'No subjects found. Create your first one!'}
        </p>
      ) : (
        <>
          {/* Keyed so the cards come in again for each page or program, but not while typing a search */}
          <section className="st-grid" aria-label="Subjects" key={`${programId}|${currentPage}`}>
            {paginatedTags.map(renderSubjectCard)}
          </section>

          <div className="st-pager">
            <Pagination
              currentPage={currentPage}
              totalItems={filteredTags.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              itemLabel={filteredTags.length === 1 ? 'subject' : 'subjects'}
              maxPageButtons={5}
              alwaysShowControls
            />
          </div>
        </>
      )}

      <Modal
        open={Boolean(openTag)}
        onClose={() => setOpenTagId(null)}
        title={openTag?.name || 'Subject'}
        bodyClassName="st-window-body"
      >
        {openTag && (
          <>
            <div className="ca-view-toggle st-window-toggle" role="group" aria-label="Show in this window">
              {WINDOW_VIEWS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={windowView === value ? 'is-active' : ''}
                  onClick={() => setWindowView(value)}
                  aria-pressed={windowView === value}
                >
                  {label}
                  {viewCounts[value] !== null && <span className="st-window-count">{viewCounts[value]}</span>}
                </button>
              ))}
            </div>

            {/* Keyed so each view starts at the top and fades in */}
            <div className="st-window-view" key={`${openTag._id}-${windowView}`}>
              {windowView === 'questions' ? renderQuestionsView() : renderExamsView()}
            </div>

            <div className="modal-actions st-window-actions">
              <span className="st-window-delete">
                <TrashButton
                  label={hasQuestions ? `${openTag.name} can't be deleted while questions use it` : `Delete ${openTag.name}`}
                  onClick={() => setTagToDelete(openTag)}
                  disabled={hasQuestions}
                />
                {hasQuestions && <span className="st-window-hint">Can't be deleted while questions use it</span>}
              </span>
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={() => setSubjectForm({ tag: openTag, name: openTag.name, error: '' })}
              >
                Edit Subject
              </button>
              <button type="button" className="modal-btn-primary" onClick={() => setOpenTagId(null)}>
                Close
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* On the body like the windows, and above them, since it opens from the subject window */}
      {fullscreenImage && createPortal(
        <div
          className="ca-image-overlay st-image-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="ca-image-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="ca-image-close" onClick={() => setFullscreenImage(null)}>Close</button>
            <AuthImage src={fullscreenImage} alt="Question preview" className="ca-image-full" />
          </div>
        </div>,
        document.body,
      )}

      <Modal
        open={Boolean(subjectForm)}
        onClose={() => setSubjectForm(null)}
        title={subjectForm?.tag ? 'Edit Subject' : 'Add New Subject'}
      >
        <div className="qp-modal-copy">
          <p className="qp-modal-subtitle">
            {subjectForm?.tag
              ? 'The new name also shows on every question and exam using this subject.'
              : isDean
                ? 'Create a new subject category for the selected program.'
                : 'Create a new subject category for your program\'s questions.'}
          </p>
        </div>

        <form onSubmit={handleSubmitSubject}>
          {isDean && !subjectForm?.tag ? (
            <div className="adminCatalog-form-group">
              <label className="form-title">Program *</label>
              <select
                className="st-dean-modal-select"
                value={programId}
                onChange={(event) => changeProgram(event.target.value)}
                required
              >
                <option value="">{`Select ${departmentLabel} Program`}</option>
                {programs.map((program) => (
                  <option key={program._id} value={program._id}>
                    {program.name} {program.code ? `(${program.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="adminCatalog-form-group">
            <label className="form-title">Subject Name *</label>
            <input
              type="text"
              placeholder="e.g. Mathematics"
              value={subjectForm?.name || ''}
              onChange={(event) => updateSubjectForm({ name: event.target.value, error: '' })}
              maxLength={60}
              autoFocus
              required
            />
          </div>

          {subjectForm?.error && <p className="error-text" role="alert">{subjectForm.error}</p>}

          <div className="modal-actions ct-modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={() => setSubjectForm(null)}>
              Cancel
            </button>
            <button type="submit" className="modal-btn-primary" disabled={saving || (isDean && !programId)}>
              {saving ? 'Saving...' : subjectForm?.tag ? 'Save Changes' : 'Add Subject'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmationModal
        open={!!tagToDelete}
        onClose={() => setTagToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete Subject"
        message={(
          <p style={{ margin: 0 }}>
            Are you sure you want to delete the subject <strong>"{tagToDelete?.name}"</strong>?
          </p>
        )}
        confirmLabel="Delete Subject"
        confirmVariant="danger"
        busy={saving}
      >
        <p className="qp-warning-text" style={{ margin: 0 }}>
          This action cannot be undone.
          {examsUsingTagToDelete > 0 && ` ${formatCount(examsUsingTagToDelete, 'exam')} will stop listing this subject.`}
        </p>
      </ConfirmationModal>

      <FeedbackModal
        open={!!feedbackModal}
        onClose={() => setFeedbackModal(null)}
        title={feedbackModal?.title || 'Notification'}
        tone={feedbackModal?.tone || 'info'}
        message={feedbackModal?.message}
      />
    </main>
  );
}
