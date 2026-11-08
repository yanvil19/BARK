import { useEffect, useMemo, useRef, useState } from 'react';
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
import PanelHeader from '../../components/PanelHeader.jsx';
import { useToast } from '../../components/Toast.jsx';
import usePanelLayout from '../../hooks/usePanelLayout.js';
import { ExamStatePill, Marker, MarkerLegend, StatePill, USED_IN_EXAM_ICON } from '../../components/QuestionMarkers.jsx';
import { formatDateTime } from '../../utils/dateFormat.js';
import '../../styles/components/QuestionFilters.css';
import '../../styles/shared/SubjectTags.css';
import '../../styles/global.css';
// The list, panel and motion are the same as Approve Questions, so they share its styles
import '../../styles/shared/QuestionApprovals.css';
import QuestionStepper from '../../components/QuestionStepper.jsx';

const BASE = import.meta.env.VITE_API_URL;
const PAGE_SIZE = 10;

const PANEL_VIEWS = [
  { value: 'questions', label: 'Questions' },
  { value: 'exams', label: 'Exams' },
];

const LEGEND_ITEMS = [
  { text: 'Questions', className: 'ca-marker--count', content: '#' },
  { text: 'Exams', className: 'ca-marker--used', content: USED_IN_EXAM_ICON },
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
  // The panel: the open subject, Questions or Exams, the question shown, and the image opened full
  // size. The view stays as it is when another subject opens.
  const [selectedTagId, setSelectedTagId] = useState(null);
  const [panelView, setPanelView] = useState('questions');
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  // Widened over the list, or covering the whole window
  const panelLayout = usePanelLayout(selectedTagId);
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
  const selectedTag = useMemo(
    () => (selectedTagId ? tags.find((tag) => tag._id === selectedTagId) || null : null),
    [tags, selectedTagId],
  );
  const selectedUsage = (selectedTag && usageByTag.get(selectedTag._id)) || NO_USAGE;

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

  // The list scrolls on its own: each page or search starts at the top...
  const listScrollRef = useRef(null);
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [currentPage, searchQuery, programId]);

  // ...and the open subject's card stays in view when the columns change, once they finish gliding
  useEffect(() => {
    listScrollRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [selectedTagId, currentPage, panelLayout.isExpanded, panelLayout.isGliding]);

  // Windows too short to fit the page scroll it, which can leave the panel partly off screen
  const panelRef = useRef(null);
  useEffect(() => {
    if (!selectedTagId) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selectedTagId]);

  useEffect(() => {
    if (!fullscreenImage) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setFullscreenImage(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [fullscreenImage]);

  function changeProgram(nextProgramId) {
    setProgramId(nextProgramId);
    setSelectedTagId(null);
    setSearchQuery('');
  }

  function handleSelectTag(tag) {
    if (tag._id === selectedTagId) return;
    setSelectedTagId(tag._id);
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
      if (selectedTagId === tagToDelete._id) setSelectedTagId(null);
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
  const countsLoaded = {
    questions: !questionList.loading && !questionList.error,
    exams: !examList.loading && !examList.error,
  };
  const examsUsingTagToDelete = tagToDelete ? (usageByTag.get(tagToDelete._id) || NO_USAGE).exams.length : 0;

  function renderSubjectCard(tag, cardIndex) {
    const usage = usageByTag.get(tag._id) || NO_USAGE;

    return (
      <div
        key={tag._id}
        className={`ca-question-card ${tag._id === selectedTagId ? 'is-active' : ''}`}
        style={{ '--card-index': cardIndex }}
        onClick={() => handleSelectTag(tag)}
      >
        <div className="ca-card-top">
          {/* Its click bubbles up to the card, so keyboard users can open the card too */}
          <button type="button" className="ca-card-open">
            <span className="ca-card-title">{tag.name}</span>
          </button>
          <div className="ca-card-markers">
            {countsLoaded.questions && (
              <Marker className="ca-marker--count" label={formatCount(usage.questions.length, 'question')}>
                {usage.questions.length}
              </Marker>
            )}
            {countsLoaded.exams && (
              <Marker className="ca-marker--used st-marker--exams" label={formatCount(usage.exams.length, 'exam')}>
                {USED_IN_EXAM_ICON}
                {usage.exams.length}
              </Marker>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderQuestionsView() {
    if (questionList.loading) return <p className="ca-panel-note">Loading questions...</p>;
    if (questionList.error) return <p className="ca-panel-note ca-panel-note--error" role="alert">{questionList.error}</p>;
    if (selectedUsage.questions.length === 0) {
      return <p className="ca-panel-note">No submitted questions use this subject yet. Drafts are not shown here.</p>;
    }

    return (
      <QuestionStepper
        questions={selectedUsage.questions}
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
    if (selectedUsage.exams.length === 0) return <p className="ca-panel-note">No exam uses this subject yet.</p>;

    return (
      <section className="question-panel">
        <p className="question-panel-label">Exams Using This Subject ({selectedUsage.exams.length})</p>
        <ul className="st-exam-list">
          {selectedUsage.exams.map(({ exam, questionCount }) => (
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

  const hasQuestions = selectedUsage.questions.length > 0;

  return (
    <main className="st-page ca-page ca-page--stepper page-shell">
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

      <div className={panelLayout.layoutClass(Boolean(selectedTag))} onTransitionEnd={panelLayout.onLayoutTransitionEnd}>
        <section className="ca-list-panel" aria-label="Subjects">
          <MarkerLegend items={LEGEND_ITEMS} ariaLabel="What the subject markers mean" />

          <div className="ca-list-scroll" ref={listScrollRef}>
            {loading ? (
              <div className="ca-empty">Loading subjects...</div>
            ) : filteredTags.length === 0 ? (
              <div className="ca-empty">
                {isDean && !programId
                  ? 'Select a program first to view its subjects.'
                  : searchQuery
                    ? `No subjects match "${searchQuery}"`
                    : 'No subjects found. Create your first one!'}
              </div>
            ) : (
              /* Keyed so the cards animate in for each new view, but not while typing a search */
              <div className="ca-questions-list" key={`${programId}|${currentPage}`}>
                {paginatedTags.map(renderSubjectCard)}
              </div>
            )}
          </div>

          {!loading && (
            <Pagination
              currentPage={currentPage}
              totalItems={filteredTags.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              itemLabel={filteredTags.length === 1 ? 'subject' : 'subjects'}
              classPrefix="ca"
              maxPageButtons={5}
            />
          )}
        </section>

        {selectedTag ? (
          <div className={panelLayout.sidebarClass} ref={panelRef}>
            <PanelHeader
              title={selectedTag.name}
              views={PANEL_VIEWS}
              view={panelView}
              onViewChange={setPanelView}
              isExpanded={panelLayout.isExpanded}
              onToggleExpanded={panelLayout.toggleExpanded}
              isFullscreen={panelLayout.isFullscreen}
              onToggleFullscreen={panelLayout.toggleFullscreen}
              onClose={() => setSelectedTagId(null)}
              closeLabel="Close subject panel"
            />

            {/* Keyed so each subject and each view starts scrolled to the top */}
            <div className="ca-sidebar-content" key={`${selectedTag._id}-${panelView}`}>
              {panelView === 'questions' ? renderQuestionsView() : renderExamsView()}
            </div>

            <div className="ca-sidebar-actions">
              <button
                type="button"
                className="ca-btn ca-btn--edit"
                onClick={() => setSubjectForm({ tag: selectedTag, name: selectedTag.name, error: '' })}
              >
                Edit
              </button>
              <TrashButton
                label={hasQuestions ? `${selectedTag.name} can't be deleted while questions use it` : `Delete ${selectedTag.name}`}
                onClick={() => setTagToDelete(selectedTag)}
                disabled={hasQuestions}
              />
            </div>
          </div>
        ) : (
          <div className="ca-sidebar ca-sidebar--empty">
            <p>Select a subject to view its questions and exams</p>
          </div>
        )}
      </div>

      {fullscreenImage && (
        <div
          className="ca-image-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="ca-image-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="ca-image-close" onClick={() => setFullscreenImage(null)}>Close</button>
            <AuthImage src={fullscreenImage} alt="Question preview" className="ca-image-full" />
          </div>
        </div>
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
