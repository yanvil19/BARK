import React, { Fragment, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import AuthImage from '../../components/AuthImage.jsx';
import QuestionDetailPanels from '../../components/QuestionDetailPanels.jsx';
import { organizeQuestionAnswers } from '../../lib/DeanTestRunOrganizer.js';
import { apiAuth, buildAuthHeaders } from '../../lib/api.js';
import SafeHtml, { truncateHtml } from '../../components/SafeHtml.jsx';
import '../../styles/shared/QuestionApprovals.css';
import PageHeader from '../../components/PageHeader.jsx';
import { useToast } from '../../components/Toast.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import TrashButton from '../../components/TrashButton.jsx';
import QuestionFilters from '../../components/QuestionFilters.jsx';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import ImportReviewBubbles from '../../components/ImportReviewBubbles.jsx';
import SetMemberRows from '../../components/SetMemberRows.jsx';
import Pagination from '../../components/Pagination.jsx';
import QuestionForm from '../../components/QuestionForm.jsx';
import { Modal } from '../../components/Modal.jsx';
import PanelHeader from '../../components/PanelHeader.jsx';
import usePanelLayout from '../../hooks/usePanelLayout.js';
import { CardLegend, EVALUATING_DOT, Marker, StateMarker, USED_IN_EXAM_ICON } from '../../components/QuestionMarkers.jsx';
import { formatDate, formatDateTime, formatTime } from '../../utils/dateFormat.js';
const BASE = import.meta.env.VITE_API_URL;

import { getStatusLabel } from '../../utils/statusLabels.js';

const STATE_FILTERS = ['all', 'pending_chair', 'restored', 'returned', 'approved', 'rejected'];
const USED_IN_EXAM_FILTER = 'approved_used';
const REVIEWABLE_STATES = ['pending_chair', 'restored'];
// States with actions in the bulk toolbar; questions in other states have no checkbox
const BULK_ACTION_STATES = [...REVIEWABLE_STATES, 'rejected'];

const LOCK_STALE_MS = 10 * 60 * 1000;

function formatCount(count, singular) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

// The questions a review changed: the whole set when the question is in one
function getReviewedQuestions(res) {
  return res?.groupQuestions?.length ? res.groupQuestions : [res.question];
}

function getSubmittedAt(question) {
  return question?.submittedAt || question?.createdAt || null;
}

function formatProgramLabel(program) {
  if (!program) return 'N/A';
  return program.name || program.code || 'N/A';
}

function truncateText(text, max = 100) {
  if (!text) return '';
  const clean = text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}...`;
}

function isBeingEvaluated(question, meId) {
  if (!question.currentReviewer || !question.reviewStartedAt) return false;
  const reviewerId = question.currentReviewer?._id || question.currentReviewer;
  if (reviewerId === meId) return false;
  const elapsed = Date.now() - new Date(question.reviewStartedAt).getTime();
  return elapsed < LOCK_STALE_MS;
}

function formatRoleLabel(role) {
  const map = { dean: 'Dean', program_chair: 'Program Chair', professor: 'Professor' };
  return map[role] || role;
}

export default function QuestionApprovals({ me }) {
  const { notify } = useToast();
  const [questions, setQuestions] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('all');
  const [examUseFilter, setExamUseFilter] = useState('all'); // 'all' | 'used' | 'not_used'
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('newest');
  const [lockedQuestionId, setLockedQuestionId] = useState(null);
  const [warningModal, setWarningModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [actionTaken, setActionTaken] = useState(false);
  // Widened over the list, or covering the whole window
  const panelLayout = usePanelLayout(selectedQuestion);
  const [returnModal, setReturnModal] = useState(null);
  const [returnNote, setReturnNote] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [editForm, setEditForm] = useState(null); // { question, groupQuestions, tags, settings }
  const [openingEdit, setOpeningEdit] = useState(false);

  // Bulk select state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedState, setSelectedState] = useState(null); // Tracks state of first checked item
  const [bulkActionModal, setBulkActionModal] = useState(null); // 'return' | 'reject' | 'restore'
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  // A set opened from one of the rows under its card starts at that question, not the first
  const openAtMemberRef = useRef(0);

  useEffect(() => {
    setActiveGroupIdx(openAtMemberRef.current);
    openAtMemberRef.current = 0;
  }, [selectedQuestion?._id, selectedQuestion?.groupId]);

  // The list scrolls on its own: each page or filter starts at the top...
  const listScrollRef = useRef(null);
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [currentPage, filter, examUseFilter, searchQuery, subjectFilter, programFilter, sortBy]);

  // ...and the open question's card stays in view as the review moves on or the columns change
  useEffect(() => {
    listScrollRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [selectedQuestion?._id, currentPage, panelLayout.isExpanded, panelLayout.isGliding]);

  // Windows too short to fit the page scroll it, which can leave the panel partly off screen
  const panelRef = useRef(null);
  useEffect(() => {
    if (!selectedQuestion) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selectedQuestion?._id]);

  const itemsPerPage = 10;
  const lockedIdRef = useRef(null);
  const actionTakenRef = useRef(false);
  const selectSeqRef = useRef(0);

  useEffect(() => { lockedIdRef.current = lockedQuestionId; }, [lockedQuestionId]);
  useEffect(() => { actionTakenRef.current = actionTaken; }, [actionTaken]);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiAuth(`${BASE}/api/questions/approvals`);
      setQuestions(data.questions || []);
    } catch (err) {
      console.error('Failed to load approvals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const data = await apiAuth(`${BASE}/api/tags`);
      setTags(data.tags || []);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
    fetchTags();
  }, [fetchApprovals, fetchTags]);

  useEffect(() => {
    const releaseLock = () => {
      const id = lockedIdRef.current;
      if (!id) return;
      fetch(`${BASE}/api/questions/${id}/unlock`, {
        method: 'PATCH',
        credentials: 'include',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
        keepalive: true,
      });
    };
    window.addEventListener('beforeunload', releaseLock);
    return () => {
      window.removeEventListener('beforeunload', releaseLock);
      // Leaving the page: a lock request still in flight unlocks itself when it returns
      selectSeqRef.current += 1;
      releaseLock();
    };
  }, []);

  async function unlockCurrent() {
    if (!lockedQuestionId) return;
    try {
      await apiAuth(`${BASE}/api/questions/${lockedQuestionId}/unlock`, { method: 'PATCH' });
    } catch { }
    setLockedQuestionId(null);
  }

  async function unlockById(id) {
    if (!id) return;
    try {
      await apiAuth(`${BASE}/api/questions/${id}/unlock`, { method: 'PATCH' });
    } catch { }
  }

  // A row under a set's card opens the set at that question
  function openSetMember(question, index) {
    if (selectedQuestion?.groupId && selectedQuestion.groupId === question.groupId) {
      setActiveGroupIdx(index);
      return;
    }
    openAtMemberRef.current = index;
    handleSelectQuestion(question);
  }

  async function handleSelectQuestion(question, { afterDecision = false } = {}) {
    if (selectedQuestion?._id === question._id) return;

    const seq = ++selectSeqRef.current;
    // The question just decided can't be gone back to if this one turns out to be locked
    const prevSelected = afterDecision ? null : selectedQuestion;
    const prevLockedId = lockedIdRef.current;

    setActionTaken(false);
    actionTakenRef.current = false;

    // Optimistic UI: switch immediately, do network lock/unlock in background
    setSelectedQuestion(question);

    if (question.state !== 'pending_chair' && question.state !== 'restored') {
      if (prevLockedId && !actionTakenRef.current) {
        unlockById(prevLockedId).finally(() => {
          if (selectSeqRef.current === seq) setLockedQuestionId(null);
        });
      }
      return;
    }

    (async () => {
      if (prevLockedId && prevLockedId !== question._id && !actionTakenRef.current) {
        await unlockById(prevLockedId);
      }

      if (selectSeqRef.current !== seq) return;

      try {
        await apiAuth(`${BASE}/api/questions/${question._id}/lock`, { method: 'PATCH' });

        if (selectSeqRef.current !== seq) {
          await unlockById(question._id);
          return;
        }

        setLockedQuestionId(question._id);
      } catch (err) {
        if (selectSeqRef.current !== seq) return;

        if (err.status === 423) {
          setWarningModal({
            question,
            reviewer: err.data?.reviewer || { name: 'Unknown', role: 'unknown' },
            minutesElapsed: err.data?.minutesElapsed || 0,
          });
          setSelectedQuestion(prevSelected);
          return;
        }

        setLockedQuestionId(null);
      }
    })();
  }

  function handleWarningProceed() {
    if (!warningModal) return;
    setSelectedQuestion(warningModal.question);
    setLockedQuestionId(warningModal.question._id);
    setWarningModal(null);
  }

  async function handleCloseSidebar() {
    if (!actionTaken && lockedQuestionId) {
      await unlockCurrent();
    }
    setSelectedQuestion(null);
    setActionTaken(false);
    setLockedQuestionId(null);
  }

  function triggerBadgeCountsRefresh() {
    window.dispatchEvent(new CustomEvent('badge-counts-updated'));
  }

  // Modal and message wording follows what an action covers: one question or a whole set
  function getItemNoun(question) {
    return question?.groupId ? 'question set' : 'question';
  }

  function getItemTitle(question) {
    return question?.groupId ? 'Question Set' : 'Question';
  }

  function getSetNotice(question) {
    if (!question?.groupId) return '';
    return `This applies to all ${formatCount(setSizes.get(question.groupId) || 0, 'question')} in the set.`;
  }

  function getSetMemberIds(question) {
    if (!question.groupId) return [question._id];
    return questions.filter((q) => q.groupId === question.groupId).map((q) => q._id);
  }

  function applyReviewedQuestions(reviewed) {
    const byId = new Map(reviewed.map((q) => [String(q._id), q]));
    setQuestions((prev) => prev.map((item) => byId.get(String(item._id)) || item));
    setSelectedQuestion((prev) => (prev && byId.get(String(prev._id))) || prev);
  }

  function removeFromSelection(ids) {
    const next = new Set(selectedIds);
    ids.forEach((id) => next.delete(id));
    setSelectedIds(next);
    if (next.size === 0) setSelectedState(null);
  }

  // Opens the edit form on the question in view. Editing can outlast the review lock, so
  // the lock is taken afresh first, which also shows whether someone else holds it now.
  async function handleEdit(question, groupQuestions) {
    const seq = selectSeqRef.current;
    const lockId = selectedQuestion._id;
    setOpeningEdit(true);
    try {
      const [, tagData, settings] = await Promise.all([
        apiAuth(`${BASE}/api/questions/${lockId}/lock`, { method: 'PATCH' }),
        apiAuth(`${BASE}/api/tags?program=${question.program?._id || question.program}`),
        apiAuth(`${BASE}/api/admin/settings/public`).catch(() => ({})),
      ]);

      // Moved on to another question while this was loading
      if (selectSeqRef.current !== seq) {
        await unlockById(lockId);
        return;
      }

      setLockedQuestionId(lockId);
      setEditForm({ question, groupQuestions, tags: tagData.tags || [], settings });
    } catch (err) {
      const message = err.status === 423
        ? `${err.data?.reviewer?.name || 'Another reviewer'} is reviewing this ${getItemNoun(question)}. Try again when they finish.`
        : err.message || 'Could not open the edit form.';
      notify(message, { variant: 'error' });
    } finally {
      setOpeningEdit(false);
    }
  }

  function handleEditSaved(question, saved) {
    setEditForm(null);

    // Editing a set can add questions to it or remove them
    const savedIds = new Set(saved.map((q) => q._id));
    const removedIds = question.groupId
      ? questions.filter((q) => q.groupId === question.groupId && !savedIds.has(q._id)).map((q) => q._id)
      : [];
    const added = saved.filter((q) => !questions.some((item) => item._id === q._id));
    setQuestions((prev) => [...prev.filter((q) => !removedIds.includes(q._id)), ...added]);
    applyReviewedQuestions(saved);

    if (removedIds.length > 0) {
      removeFromSelection(removedIds);
      setActiveGroupIdx((idx) => Math.min(idx, saved.length - 1));
    }

    // The question holding the review lock may be one of those removed
    if (removedIds.includes(selectedQuestion?._id)) {
      setSelectedQuestion(saved[0]);
      setLockedQuestionId(saved[0]._id);
      apiAuth(`${BASE}/api/questions/${saved[0]._id}/lock`, { method: 'PATCH' }).catch(() => { });
    }

    const isChanged = saved.some((q) => String(q.lastEditedAt) !== String(question.lastEditedAt));
    notify(
      isChanged ? `${getItemTitle(question)} updated. It is still waiting for your decision.` : 'No changes to save.',
      { variant: isChanged ? 'success' : 'info' }
    );
  }

  // Opens the next question that still needs a decision, or closes the panel when there is none.
  // Checked questions come first when the decided question is one of them. Returns whether one opened.
  function goToNextQuestion(decided) {
    const isDecided = (q) => (decided.groupId ? q.groupId === decided.groupId : q._id === decided._id);
    const after = (list) => {
      const at = list.findIndex(isDecided);
      return [...list.slice(at + 1), ...list.slice(0, Math.max(at, 0))];
    };

    const candidates = [
      ...(bulkSelectedQuestions.some(isDecided) ? after(bulkSelectedQuestions) : []),
      ...after(displayQuestions),
    ];
    const next = candidates.find((q) => REVIEWABLE_STATES.includes(q.state) && !isBeingEvaluated(q, me?._id));
    if (!next) {
      setSelectedQuestion(null);
      return false;
    }

    // Only the All tab keeps the decided question listed, so the next one may move up a page
    const listed = filter === 'all' ? displayQuestions : displayQuestions.filter((q) => !isDecided(q));
    setCurrentPage(Math.floor(listed.indexOf(next) / itemsPerPage) + 1);
    handleSelectQuestion(next, { afterDecision: true });
    return true;
  }

  function finishDecision(question, doneLabel) {
    setActionTaken(true);
    setLockedQuestionId(null);
    lockedIdRef.current = null;
    removeFromSelection(getSetMemberIds(question));
    triggerBadgeCountsRefresh();

    const hasNext = goToNextQuestion(question);
    notify(`${getItemTitle(question)} ${doneLabel}.${hasNext ? '' : ' No more questions to review.'}`, { variant: 'success' });
  }

  async function handleRestore(question) {
    setSubmitting(true);
    try {
      const res = await apiAuth(`${BASE}/api/questions/${question._id}/review`, { method: 'POST', body: { action: 'restore', note: '' } });
      setActionTaken(true);
      setLockedQuestionId(null);
      applyReviewedQuestions(getReviewedQuestions(res));
      removeFromSelection(getSetMemberIds(question));
      triggerBadgeCountsRefresh();
      notify(`${getItemTitle(question)} restored successfully.`, { variant: 'success' });
    } catch (err) {
      if (err.status === 409) {
        notify('This question has already been reviewed by someone else.', { variant: 'error' });
        fetchApprovals();
        setSelectedQuestion(null);
      } else {
        notify(err.message || 'Failed to restore question.', { variant: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(question) {
    setConfirmModal({ action: 'approve', question });
  }

  async function performConfirm() {
    if (!confirmModal) return;
    const { action, question } = confirmModal;

    if (action === 'bulkApprove') {
      await runBulkReview('approve', undefined, 'approved');
      return;
    }

    // The modal stays open, showing it is busy, until the server has answered
    setSubmitting(true);

    if (action === 'approve') {
      try {
        const res = await apiAuth(`${BASE}/api/questions/${question._id}/review`, { method: 'POST', body: { action: 'approve' } });
        applyReviewedQuestions(getReviewedQuestions(res));
        finishDecision(question, 'approved');
      } catch (err) {
        if (err.status === 409) {
          notify('This question has already been reviewed by someone else.', { variant: 'error' });
          fetchApprovals();
          setSelectedQuestion(null);
        } else {
          notify(err.message || 'Failed to approve question.', { variant: 'error' });
        }
      }
    }

    if (action === 'reuse') {
      try {
        await apiAuth(`${BASE}/api/questions/${question._id}/review`, { method: 'POST', body: { action: 'reuse' } });
        const updated = { ...question, state: 'pending_chair', currentReviewer: null, reviewStartedAt: null };
        setQuestions((prev) => prev.map((item) => (item._id === question._id ? updated : item)));
        setSelectedQuestion(updated);
      } catch (err) {
        if (err.status === 409) {
          notify('This question has already been modified by someone else.', { variant: 'error' });
          fetchApprovals();
          setSelectedQuestion(null);
        } else {
          notify(err.message || 'Failed to mark question for reuse.', { variant: 'error' });
        }
      }
    }

    if (action === 'delete') {
      try {
        const res = await apiAuth(`${BASE}/api/questions/${question._id}/review`, { method: 'POST', body: { action: 'delete' } });
        const deleted = new Set(res.deletedIds);
        setQuestions((prev) => prev.filter((item) => !deleted.has(String(item._id))));
        removeFromSelection(res.deletedIds);
        setSelectedQuestion(null);
        notify(`${getItemTitle(question)} deleted.`, { variant: 'success' });
      } catch (err) {
        if (err.status === 409) {
          notify('This question has already been modified by someone else.', { variant: 'error' });
          fetchApprovals();
          setSelectedQuestion(null);
        } else {
          notify(err.message || 'Failed to delete question.', { variant: 'error' });
        }
      }
    }

    setSubmitting(false);
    setConfirmModal(null);
  }

  async function submitAction() {
    const noteLabel =
      actionModal.action === 'return' ? 'revision note' :
        actionModal.action === 'restore' ? 'restore feedback' :
          'rejection reason';
    if (!note.trim()) {
      notify(`A ${noteLabel} is required.`, { variant: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiAuth(`${BASE}/api/questions/${actionModal.question._id}/review`, {
        method: 'POST',
        body: { action: actionModal.action, note: note.trim() },
      });

      applyReviewedQuestions(getReviewedQuestions(res));
      setActionModal(null);
      setNote('');
      finishDecision(actionModal.question, actionModal.action === 'return' ? 'returned for revision' : 'rejected');
    } catch (err) {
      if (err.status === 409) {
        notify('This question has already been reviewed by someone else.', { variant: 'error' });
        fetchApprovals();
        setSelectedQuestion(null);
        setActionModal(null);
        setNote('');
      } else {
        notify(err.message || 'Failed to submit review.', { variant: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReuse(question) {
    setConfirmModal({ action: 'reuse', question });
  }

  async function handleDelete(question) {
    setConfirmModal({ action: 'delete', question });
  }

  function handleReturnToCreator(question) {
    setReturnModal(question);
    setReturnNote('');
    setReturnError('');
  }

  async function submitReturnToCreator() {
    if (!returnModal) return;
    if (!returnNote.trim()) {
      setReturnError('Feedback is required when returning a question.');
      return;
    }
    setReturnSubmitting(true);
    setReturnError('');
    try {
      const res = await apiAuth(`${BASE}/api/questions/${returnModal._id}/dean-return`, {
        method: 'POST',
        body: { note: returnNote.trim() },
      });
      applyReviewedQuestions(getReviewedQuestions(res));
      if (selectedQuestion?._id === returnModal._id) {
        setSelectedQuestion(null);
      }
      setReturnModal(null);
      setReturnNote('');
      triggerBadgeCountsRefresh();
      notify(`${getItemTitle(returnModal)} returned to creator successfully.`, { variant: 'success' });
    } catch (err) {
      setReturnError(err.message || 'Failed to return question.');
    } finally {
      setReturnSubmitting(false);
    }
  }

  // ── Bulk Actions ──────────────────────────────────────────
  function handleClearSelections() {
    setSelectedIds(new Set());
    setSelectedState(null);
  }

  function handleCheckbox(e, question) {
    e.stopPropagation(); // don't open sidebar

    if (!BULK_ACTION_STATES.includes(question.state)) return;
    // If a different state is already locked, block selection
    if (selectedState && question.state !== selectedState) return;

    const targetIds = question.groupId
      ? questions.filter(q => q.groupId === question.groupId).map(q => q._id)
      : [question._id];

    setSelectedIds(prev => {
      const next = new Set(prev);
      const isCurrentlyChecked = next.has(question._id);

      if (isCurrentlyChecked) {
        targetIds.forEach(id => next.delete(id));
        if (next.size === 0) setSelectedState(null);
      } else {
        targetIds.forEach(id => next.add(id));
        if (!selectedState) setSelectedState(question.state);
      }
      return next;
    });
  }

  function handleSelectAll(e) {
    e.stopPropagation();
    if (!selectedState) return;

    const matchStateOnPageIds = [];
    paginatedQuestions.forEach(q => {
      if (q.state === selectedState) {
        if (q.groupId) {
          questions.filter(s => s.groupId === q.groupId).forEach(s => matchStateOnPageIds.push(s._id));
        } else {
          matchStateOnPageIds.push(q._id);
        }
      }
    });

    const allSelected = matchStateOnPageIds.length > 0 && matchStateOnPageIds.every(id => selectedIds.has(id));

    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        matchStateOnPageIds.forEach(id => next.delete(id));
        if (next.size === 0) setSelectedState(null);
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        matchStateOnPageIds.forEach(id => next.add(id));
        return next;
      });
    }
  }

  // Runs a review action on the checked questions. A set takes one request, because
  // the server applies the action to the whole set.
  async function runBulkReview(action, reviewNote, doneLabel) {
    const selected = questions.filter((q) => selectedIds.has(q._id) && q.state === selectedState);
    const seenSets = new Set();
    const targets = selected.filter((q) => {
      if (!q.groupId) return true;
      if (seenSets.has(q.groupId)) return false;
      seenSets.add(q.groupId);
      return true;
    });

    setBulkSubmitting(true);
    const results = await Promise.allSettled(
      targets.map((q) => apiAuth(`${BASE}/api/questions/${q._id}/review`, {
        method: 'POST',
        body: { action, note: reviewNote },
      }))
    );
    const responses = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);

    let doneIds;
    if (action === 'delete') {
      doneIds = new Set(responses.flatMap((res) => res.deletedIds));
      setQuestions((prev) => prev.filter((q) => !doneIds.has(String(q._id))));
    } else {
      const reviewed = responses.flatMap(getReviewedQuestions);
      doneIds = new Set(reviewed.map((q) => String(q._id)));
      applyReviewedQuestions(reviewed);
    }

    // The question open in the panel may be one of them
    if (selectedQuestion && doneIds.has(String(selectedQuestion._id))) {
      setSelectedQuestion(null);
      setLockedQuestionId(null);
    }

    handleClearSelections();
    setBulkSubmitting(false);
    setBulkActionModal(null);
    setConfirmModal(null);
    setNote('');
    if (doneIds.size > 0) triggerBadgeCountsRefresh();

    const doneCount = selected.filter((q) => doneIds.has(String(q._id))).length;
    const failed = selected.length - doneCount;
    if (failed > 0) {
      notify(`${doneCount} ${doneLabel}. ${failed} failed (may have already been reviewed).`, { variant: 'warning' });
      fetchApprovals();
    } else {
      notify(`${formatCount(doneCount, 'question')} ${doneLabel}.`, { variant: 'success' });
    }
  }

  async function handleBulkRestore() {
    if (!selectedIds.size) return;
    await runBulkReview('restore', '', 'restored');
  }

  async function handleBulkApprove() {
    if (!selectedIds.size) return;
    setConfirmModal({ action: 'bulkApprove' });
  }

  async function handleBulkReuse() {
    if (!selectedIds.size) return;
    if (!window.confirm(`Mark ${selectedIds.size} question${selectedIds.size > 1 ? 's' : ''} for reuse?`)) return;

    setBulkSubmitting(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map(id => apiAuth(`${BASE}/api/questions/${id}/review`, {
        method: 'POST',
        body: { action: 'reuse' },
      }))
    );

    const succeeded = ids.filter((_, i) => results[i].status === 'fulfilled');
    setQuestions(prev => prev.map(q =>
      succeeded.includes(q._id)
        ? { ...q, state: 'pending_chair', currentReviewer: null, reviewStartedAt: null }
        : q
    ));
    handleClearSelections();
    setBulkSubmitting(false);

    const failed = ids.length - succeeded.length;
    if (failed > 0) alert(`${succeeded.length} marked for reuse. ${failed} failed.`);
  }

  async function handleBulkDelete() {
    if (!selectedIds.size) return;
    if (!window.confirm(`Permanently delete ${selectedIds.size} question${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    await runBulkReview('delete', undefined, 'deleted');
  }

  async function handleBulkSubmitAction() {
    if (!note.trim()) {
      notify(`A ${bulkActionModal === 'return' ? 'revision note' : bulkActionModal === 'restore' ? 'restore feedback' : 'rejection reason'} is required.`, { variant: 'error' });
      return;
    }

    await runBulkReview(bulkActionModal, note.trim(), bulkActionModal === 'return' ? 'returned for revision' : 'rejected');
  }
  // ─────────────────────────────────────────────────────────

  const setSizes = useMemo(() => {
    const sizes = new Map();
    questions.forEach((q) => {
      if (q.groupId) sizes.set(q.groupId, (sizes.get(q.groupId) || 0) + 1);
    });
    return sizes;
  }, [questions]);

  const subjectOptions = useMemo(() => {
    const map = new Map();
    tags.forEach((tag) => {
      if (tag?._id && tag?.name) map.set(String(tag._id), { id: String(tag._id), name: tag.name });
    });
    questions.forEach((question) => {
      const id = question.tag?._id || question.tag;
      const name = question.tag?.name;
      if (id && name && !map.has(String(id))) map.set(String(id), { id: String(id), name });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [questions, tags]);

  const programOptions = useMemo(() => {
    const map = new Map();
    questions.forEach((q) => {
      const id = q.program?._id || q.program;
      const name = q.program?.name || q.program?.code;
      if (id && name && !map.has(String(id))) map.set(String(id), { id: String(id), name });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [questions]);

  const counts = useMemo(() => {
    const result = { all: questions.length };
    STATE_FILTERS.forEach((state) => {
      if (state === 'all') return;
      result[state] = questions.filter((q) => q.state === state).length;
    });
    // Counts for exam-use sub-filter
    const approvedQuestions = questions.filter((q) => q.state === 'approved');
    result._used = approvedQuestions.filter((q) => q.is_used_in_exam).length;
    result._not_used = approvedQuestions.filter((q) => !q.is_used_in_exam).length;
    return result;
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    const next = questions.filter((question) => {
      if (filter !== 'all' && question.state !== filter) return false;

      // Exam-use sub-filter — only applies when 'approved' is active
      if (filter === 'approved') {
        if (examUseFilter === 'used' && !question.is_used_in_exam) return false;
        if (examUseFilter === 'not_used' && question.is_used_in_exam) return false;
      }

      if (subjectFilter) {
        const qTag = question.tag?._id || question.tag;
        if (String(qTag) !== String(subjectFilter)) return false;
      }
      if (programFilter) {
        const qProgram = question.program?._id || question.program;
        if (String(qProgram) !== String(programFilter)) return false;
      }
      if (!needle) return true;
      const content = [question.description, question.tag?.name, question.createdBy?.name]
        .filter(Boolean).join(' ').toLowerCase();
      return content.includes(needle);
    });
    next.sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.submittedAt || a.createdAt || 0) - new Date(b.submittedAt || b.createdAt || 0);
      return new Date(b.submittedAt || b.createdAt || 0) - new Date(a.submittedAt || a.createdAt || 0);
    });

    // Keep questions belonging to the same group contiguous and ordered by groupOrder
    const groupClusters = new Map();
    const result = [];
    for (const q of next) {
      if (!q.groupId) {
        result.push(q);
      } else {
        if (!groupClusters.has(q.groupId)) {
          groupClusters.set(q.groupId, []);
          result.push({ _isGroupClusterPlaceholder: true, groupId: q.groupId });
        }
        groupClusters.get(q.groupId).push(q);
      }
    }

    const finalQuestions = [];
    for (const item of result) {
      if (item._isGroupClusterPlaceholder) {
        const cluster = groupClusters.get(item.groupId) || [];
        cluster.sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));
        finalQuestions.push(...cluster);
      } else {
        finalQuestions.push(item);
      }
    }

    return finalQuestions;
  }, [questions, examUseFilter, filter, searchQuery, subjectFilter, programFilter, sortBy]);

  const displayQuestions = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const q of filteredQuestions) {
      if (!q.groupId) {
        list.push(q);
      } else if (!seen.has(q.groupId)) {
        seen.add(q.groupId);
        list.push(q);
      }
    }
    return list;
  }, [filteredQuestions]);

  const { paginatedQuestions, totalPages } = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      paginatedQuestions: displayQuestions.slice(startIndex, endIndex),
      totalPages: Math.ceil(displayQuestions.length / itemsPerPage) || 1,
    };
  }, [displayQuestions, currentPage]);

  useEffect(() => { setCurrentPage(1); handleClearSelections(); }, [filter, examUseFilter, searchQuery, subjectFilter, programFilter, sortBy]);

  // Decided questions leave the list, which can empty the last page
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Every count is in questions, like the status pills; a set is one list item but several questions
  const listedQuestionCount = useMemo(
    () => displayQuestions.reduce((sum, q) => sum + (q.groupId ? setSizes.get(q.groupId) || 1 : 1), 0),
    [displayQuestions, setSizes]
  );
  const isListPlural = displayQuestions.length !== 1;
  const listItemLabel = listedQuestionCount === displayQuestions.length
    ? (isListPlural ? 'questions' : 'question')
    : `${isListPlural ? 'items' : 'item'} (${formatCount(listedQuestionCount, 'question')})`;

  // Match checks for Select All UI element
  const matchStateOnPage = paginatedQuestions.filter(q => q.state === selectedState);
  const matchStateOnPageIds = useMemo(() => {
    const ids = [];
    paginatedQuestions.forEach(q => {
      if (q.state === selectedState) {
        if (q.groupId) {
          questions.filter(s => s.groupId === q.groupId).forEach(s => ids.push(s._id));
        } else {
          ids.push(q._id);
        }
      }
    });
    return ids;
  }, [paginatedQuestions, selectedState, questions]);

  const pageHasCheckboxes = paginatedQuestions.some((q) => BULK_ACTION_STATES.includes(q.state));

  const allPendingSelected = matchStateOnPageIds.length > 0 && matchStateOnPageIds.every(id => selectedIds.has(id));
  const somePendingSelected = matchStateOnPageIds.some(id => selectedIds.has(id));

  // Ordered list of bulk-selected items (follows displayQuestions order for consistent navigation)
  const bulkSelectedQuestions = useMemo(
    () => displayQuestions.filter(q => {
      if (q.groupId) {
        return questions.filter(s => s.groupId === q.groupId).some(s => selectedIds.has(s._id));
      }
      return selectedIds.has(q._id);
    }),
    [displayQuestions, questions, selectedIds]
  );
  const bulkNavIndex = selectedQuestion
    ? bulkSelectedQuestions.findIndex(q => q.groupId ? q.groupId === selectedQuestion.groupId : q._id === selectedQuestion._id)
    : -1;

  return (
    <main className="ca-page page-shell">
      <PageHeader
        title="Questions for Review and Approval"
        subtitle="Questions submitted by faculty for your review"
      />

      <CapsuleFilters
        className="ca-state-pills"
        ariaLabel="Filter questions by status"
        options={[
          ...STATE_FILTERS.map((state) => ({
            value: state,
            label: state === 'all' ? 'All' : getStatusLabel(state),
            count: counts[state] || 0,
          })),
          { value: USED_IN_EXAM_FILTER, label: 'Used in Exam', count: counts._used || 0 },
        ]}
        value={filter === 'approved' && examUseFilter === 'used' ? USED_IN_EXAM_FILTER : filter}
        onChange={(value) => {
          // "Used in Exam" is approved questions narrowed by the exam-use sub-filter
          if (value === USED_IN_EXAM_FILTER) {
            setFilter('approved');
            setExamUseFilter('used');
          } else {
            setFilter(value);
            setExamUseFilter('all');
          }
        }}
      />



      <QuestionFilters
        className="ca-filters-wrapper"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        role={me?.role}
        subjectFilter={subjectFilter}
        onSubjectChange={setSubjectFilter}
        subjectOptions={subjectOptions}
        programFilter={programFilter}
        onProgramChange={setProgramFilter}
        programOptions={programOptions}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      <div className={panelLayout.layoutClass(Boolean(selectedQuestion))} onTransitionEnd={panelLayout.onLayoutTransitionEnd}>
        <section className="ca-list-panel" aria-label="Questions">
          <CardLegend states={STATE_FILTERS.filter((state) => state !== 'all')} showEvaluating />

          {/* Bulk Toolbar */}
          {selectedIds.size > 0 && (
            <div className="ca-bulk-toolbar">
              <span className="ca-bulk-count">
                {selectedIds.size} {selectedState ? getStatusLabel(selectedState) : ''} question{selectedIds.size > 1 ? 's' : ''} selected
              </span>
              <div className="ca-bulk-actions">
                {(selectedState === 'pending_chair' || selectedState === 'restored') && (
                  <>
                    <button className="ca-bulk-btn ca-bulk-btn--approve" onClick={handleBulkApprove} disabled={bulkSubmitting}>Approve All</button>
                    <button className="ca-bulk-btn ca-bulk-btn--return" onClick={() => { setBulkActionModal('return'); setNote(''); }} disabled={bulkSubmitting}>Return All</button>
                    <button className="ca-bulk-btn ca-bulk-btn--reject" onClick={() => { setBulkActionModal('reject'); setNote(''); }} disabled={bulkSubmitting}>Reject All</button>
                  </>
                )}
                {selectedState === 'rejected' && (
                  <>
                    <button className="ca-bulk-btn ca-bulk-btn--return" onClick={handleBulkRestore} disabled={bulkSubmitting}>Restore All</button>
                    <TrashButton label="Delete all selected questions" onClick={handleBulkDelete} disabled={bulkSubmitting} />
                  </>
                )}
                <button
                  className="ca-bulk-btn ca-bulk-btn--clear"
                  onClick={handleClearSelections}
                  disabled={bulkSubmitting}
                >
                  ✕ Clear
                </button>
              </div>
            </div>
          )}

          <div className="ca-list-scroll" ref={listScrollRef}>
            {loading ? (
              <div className="ca-empty">Loading questions...</div>
            ) : filteredQuestions.length === 0 ? (
              <div className="ca-empty">
                {filter === 'pending_chair' && !searchQuery.trim() && !subjectFilter && !programFilter
                  ? 'No questions are waiting for review.'
                  : 'No questions found.'}
              </div>
            ) : (
              <>
                {/* Select All row — only shows when at least one selection is made and matching states are on this page */}
                {selectedIds.size > 0 && matchStateOnPage.length > 0 && (
                  <div className="ca-select-all-row">
                    <label className="ca-select-all-label" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="ca-checkbox"
                        checked={allPendingSelected}
                        ref={el => { if (el) el.indeterminate = somePendingSelected && !allPendingSelected; }}
                        onChange={handleSelectAll}
                      />
                      <span>Select all {getStatusLabel(selectedState)} on this page ({matchStateOnPageIds.length})</span>
                    </label>
                    {paginatedQuestions.some((q) => BULK_ACTION_STATES.includes(q.state) && q.state !== selectedState) && (
                      <span className="ca-select-all-hint">Only one status can be selected at a time.</span>
                    )}
                  </div>
                )}

                {/* Keyed so the cards animate in for each new view, but not while typing a search */}
                <div
                  className="ca-questions-list"
                  key={[filter, examUseFilter, subjectFilter, programFilter, sortBy, currentPage].join('|')}
                >
                  {paginatedQuestions.map((question, cardIndex) => {
                    const isGrouped = !!question.groupId;
                    const groupSiblings = isGrouped ? questions.filter(q => q.groupId === question.groupId).sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0)) : [];
                    const hasBulkActions = BULK_ACTION_STATES.includes(question.state);
                    const isCheckable = hasBulkActions && (!selectedState || selectedState === question.state);
                    const isActive = isGrouped ? selectedQuestion?.groupId === question.groupId : selectedQuestion?._id === question._id;
                    const isAllGroupChecked = isGrouped && groupSiblings.length > 0 && groupSiblings.every(q => selectedIds.has(q._id));
                    const isSomeGroupChecked = isGrouped && groupSiblings.some(q => selectedIds.has(q._id));
                    const isCardChecked = isGrouped ? isAllGroupChecked : selectedIds.has(question._id);
                    const isUsedInExam = question.state === 'approved'
                      && (isGrouped ? groupSiblings.some((q) => q.is_used_in_exam) : question.is_used_in_exam);

                    return (
                      <Fragment key={question.groupId || question._id}>
                      <div
                        className={`${isGrouped ? 'ca-group-header-card' : 'ca-question-card'} ${isActive ? 'is-active' : ''} ${isCardChecked ? 'is-checked' : ''}`}
                        style={{ '--card-index': cardIndex }}
                        onClick={() => handleSelectQuestion(question)}
                      >
                        <div className="ca-card-top">
                          {/* The column stays on every card of the page so the text lines up */}
                          {pageHasCheckboxes && (
                            <div
                              className={`ca-card-checkbox-wrap ${hasBulkActions && !isCheckable ? 'is-disabled' : ''}`}
                              title={hasBulkActions && !isCheckable ? `Only ${getStatusLabel(selectedState)} questions can be selected with your current selection` : undefined}
                              onClick={hasBulkActions ? (e) => handleCheckbox(e, question) : undefined}
                            >
                              {hasBulkActions && (
                                <input
                                  type="checkbox"
                                  className="ca-checkbox"
                                  aria-label={`Select this ${getItemNoun(question)}`}
                                  checked={isCardChecked}
                                  disabled={!isCheckable}
                                  ref={el => { if (el) el.indeterminate = isSomeGroupChecked && !isAllGroupChecked; }}
                                  onChange={() => { }}
                                />
                              )}
                            </div>
                          )}
                          {/* Its click bubbles up to the card, so keyboard users can open the card too */}
                          <button type="button" className="ca-card-open">
                            <span className={`ca-card-desc ${isGrouped ? 'ca-card-desc--set' : ''}`}>
                              {isGrouped
                                ? (question.groupContext?.trim() ? <SafeHtml html={truncateHtml(question.groupContext.trim(), 80)} /> : 'Question Set')
                                : <SafeHtml html={truncateHtml(question.description, 100)} />}
                            </span>
                          </button>
                          <div className="ca-card-markers">
                            {isGrouped && (
                              <Marker className="ca-marker--count" label={formatCount(groupSiblings.length, 'question')}>{groupSiblings.length}</Marker>
                            )}
                            {isBeingEvaluated(question, me?._id) && (
                              <Marker className="ca-marker--evaluating" label="Being evaluated">{EVALUATING_DOT}</Marker>
                            )}
                            {isUsedInExam && (
                              <Marker className="ca-marker--used" label="Used in exam">{USED_IN_EXAM_ICON}</Marker>
                            )}
                            <StateMarker state={question.state} />
                          </div>
                        </div>
                        <div className="ca-card-meta">
                          {me?.role === 'dean' && <span className="ca-program-pill">{formatProgramLabel(question.program)}</span>}
                          <span className="ca-tag-pill">{question.tag?.name || 'N/A'}</span>
                          <span className="ca-author">{question.createdBy?.name || 'Unknown'}</span>
                          <span className="ca-card-meta-datetime">
                            <span className="ca-date">{formatDate(getSubmittedAt(question))}</span>
                            <span className="ca-time">{formatTime(getSubmittedAt(question))}</span>
                          </span>
                        </div>
                      </div>
                      {isGrouped && (
                        <SetMemberRows
                          members={groupSiblings}
                          open={isActive}
                          activeIndex={activeGroupIdx}
                          cardIndex={cardIndex}
                          onOpenMember={(index) => openSetMember(question, index)}
                        />
                      )}
                      </Fragment>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {!loading && (
            <Pagination
              currentPage={currentPage}
              totalItems={displayQuestions.length}
              pageSize={itemsPerPage}
              onPageChange={setCurrentPage}
              itemLabel={listItemLabel}
              classPrefix="ca"
              maxPageButtons={5}
            />
          )}
        </section>

        {selectedQuestion ? (() => {
          const isGroupedReview = !!selectedQuestion.groupId;
          const groupSiblingsReview = isGroupedReview
            ? questions.filter(q => q.groupId === selectedQuestion.groupId).sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0))
            : [selectedQuestion];
          const currentReviewQuestion = isGroupedReview
            ? (groupSiblingsReview[activeGroupIdx] || groupSiblingsReview[0] || selectedQuestion)
            : selectedQuestion;
          // A set is returned as one, so one question in an exam holds back the whole set
          const isUsedInExam = groupSiblingsReview.some((q) => q.is_used_in_exam);

          return (
            <div className={panelLayout.sidebarClass} ref={panelRef}>
              <PanelHeader
                title={isGroupedReview ? `Review Question Set (${groupSiblingsReview.length} Questions)` : 'Review Question'}
                isExpanded={panelLayout.isExpanded}
                onToggleExpanded={panelLayout.toggleExpanded}
                isFullscreen={panelLayout.isFullscreen}
                onToggleFullscreen={panelLayout.toggleFullscreen}
                onClose={handleCloseSidebar}
                closeLabel="Close question review"
              >
                {bulkSelectedQuestions.length > 1 && bulkNavIndex !== -1 && (
                  <div className="ca-bulk-nav">
                    <button
                      type="button"
                      className="ca-bulk-nav-btn"
                      onClick={() => handleSelectQuestion(bulkSelectedQuestions[bulkNavIndex - 1])}
                      disabled={bulkNavIndex === 0}
                      title="Previous selected question"
                    >
                      ←
                    </button>
                    <span className="ca-bulk-nav-label">{bulkNavIndex + 1} / {bulkSelectedQuestions.length}</span>
                    <button
                      type="button"
                      className="ca-bulk-nav-btn"
                      onClick={() => handleSelectQuestion(bulkSelectedQuestions[bulkNavIndex + 1])}
                      disabled={bulkNavIndex === bulkSelectedQuestions.length - 1}
                      title="Next selected question"
                    >
                      →
                    </button>
                  </div>
                )}
              </PanelHeader>

              {/* Keyed so each question starts scrolled to the top */}
              <div className="ca-sidebar-content" key={selectedQuestion.groupId || selectedQuestion._id}>
                {isGroupedReview && groupSiblingsReview.length > 1 && (
                  <ImportReviewBubbles
                    questions={groupSiblingsReview}
                    currentIdx={activeGroupIdx}
                    onSelectQuestion={setActiveGroupIdx}
                    readOnly
                    allInOneSet
                  />
                )}

                {/* Keyed here and below so moving between a set's questions fades them in */}
                <QuestionDetailPanels
                  key={currentReviewQuestion._id}
                  question={organizeQuestionAnswers(currentReviewQuestion)}
                  passage={isGroupedReview ? (currentReviewQuestion.groupContext || selectedQuestion.groupContext || '').trim() : ''}
                  passageImages={isGroupedReview ? (currentReviewQuestion.groupContextImages || selectedQuestion.groupContextImages || []) : []}
                  onZoom={setFullscreenImage}
                />

                <section className="ca-section ca-review-metadata" key={`details-${currentReviewQuestion._id}`}>
                  <div className="ca-meta-grid">
                    <div>
                      <span className="ca-meta-label">Subject</span>
                      <div className="ca-meta-value">{currentReviewQuestion.tag?.name || selectedQuestion.tag?.name || 'N/A'}</div>
                    </div>
                    <div>
                      <span className="ca-meta-label">Professor</span>
                      <div className="ca-meta-value">{currentReviewQuestion.createdBy?.name || selectedQuestion.createdBy?.name || 'Unknown'}</div>
                    </div>
                    <div>
                      <span className="ca-meta-label">Program</span>
                      <div className="ca-meta-value">{formatProgramLabel(currentReviewQuestion.program || selectedQuestion.program)}</div>
                    </div>
                    <div>
                      <span className="ca-meta-label">Submitted</span>
                      <div className="ca-meta-value">{formatDateTime(getSubmittedAt(currentReviewQuestion))}</div>
                    </div>
                    <div>
                      <span className="ca-meta-label">Last Edited By</span>
                      <div className="ca-meta-value">
                        {currentReviewQuestion.lastEditedAt ? (currentReviewQuestion.lastEditedBy?.name || 'Unknown') : 'Not edited'}
                      </div>
                    </div>
                    <div>
                      <span className="ca-meta-label">Last Edited</span>
                      <div className="ca-meta-value">{formatDateTime(currentReviewQuestion.lastEditedAt)}</div>
                    </div>
                  </div>
                </section>

                {(currentReviewQuestion.state === 'returned' || selectedQuestion.state === 'returned') && (currentReviewQuestion.revisionNote || selectedQuestion.revisionNote) && (
                  <section className="ca-section ca-section--note">
                    <h3 className="ca-section-label">Revision Note</h3>
                    <p className="ca-note-text">{currentReviewQuestion.revisionNote || selectedQuestion.revisionNote}</p>
                  </section>
                )}

                {(currentReviewQuestion.state === 'rejected' || selectedQuestion.state === 'rejected') && (currentReviewQuestion.rejectionReason || selectedQuestion.rejectionReason) && (
                  <section className="ca-section ca-section--note">
                    <h3 className="ca-section-label">Rejection Reason</h3>
                    <p className="ca-note-text">{currentReviewQuestion.rejectionReason || selectedQuestion.rejectionReason}</p>
                  </section>
                )}
              </div>

              <div className="ca-sidebar-actions">
                {(selectedQuestion.state === 'pending_chair' || selectedQuestion.state === 'restored') ? (
                  <>
                    <button
                      className="ca-btn ca-btn--edit"
                      onClick={() => handleEdit(currentReviewQuestion, isGroupedReview ? groupSiblingsReview : null)}
                      disabled={openingEdit}
                    >
                      Edit
                    </button>
                    <button className="ca-btn ca-btn--approve" onClick={() => handleApprove(selectedQuestion)}>Approve</button>
                    <button className="ca-btn ca-btn--return" onClick={() => { setActionModal({ question: selectedQuestion, action: 'return' }); setNote(''); }}>Return for Revision</button>
                    <button className="ca-btn ca-btn--reject" onClick={() => { setActionModal({ question: selectedQuestion, action: 'reject' }); setNote(''); }}>Reject</button>
                  </>
                ) : (selectedQuestion.state === 'rejected') ? (
                  <div className="ca-sidebar-action-row">
                    <button className="ca-btn ca-btn--restore" onClick={() => handleRestore(selectedQuestion)} disabled={submitting}>Restore for Revision</button>
                    <TrashButton label={`Delete ${getItemNoun(selectedQuestion)}`} onClick={() => handleDelete(selectedQuestion)} disabled={submitting} />
                  </div>
                ) : (selectedQuestion.state === 'approved' && !isUsedInExam) ? (
                  <button className="ca-btn ca-btn--return" onClick={() => handleReturnToCreator(selectedQuestion)}>Return to Creator</button>
                ) : (
                  <p className="ca-no-actions">No actions available for this {getItemNoun(selectedQuestion)}.</p>
                )}
              </div>
            </div>
          );
        })() : (
          <div className="ca-sidebar ca-sidebar--empty">
            <p>Select a question to view details</p>
          </div>
        )}
      </div>

      {/* Reviewer's edit: the same form the creator uses, keeping the question in review */}
      <Modal
        open={!!editForm}
        onClose={() => setEditForm(null)}
        title={editForm?.question.groupId ? 'Edit Question Set' : 'Edit Question'}
      >
        {editForm && (
          <>
            <div className="qp-modal-copy">
              <p className="qp-modal-subtitle">
                {`Your changes are saved under your name, and the ${getItemNoun(editForm.question)} stays in review.`}
              </p>
              <span className="qp-modal-program-chip">{formatProgramLabel(editForm.question.program)}</span>
            </div>
            <QuestionForm
              key={editForm.question.groupId || editForm.question._id}
              me={me}
              tags={editForm.tags}
              initialData={editForm.question}
              initialGroupQuestions={editForm.groupQuestions}
              maxImages={Number(editForm.settings.maxUploadImages ?? 5)}
              maxAnswerImages={Number(editForm.settings.maxAnswerImages ?? 5)}
              maxGroupContextImages={Number(editForm.settings.maxGroupContextImages ?? 5)}
              reviewEdit
              onSaved={(saved) => handleEditSaved(editForm.question, saved)}
              onClose={() => setEditForm(null)}
            />
          </>
        )}
      </Modal>

      {/* Single Question Action Modal */}
      <ConfirmationModal
        open={!!actionModal}
        onClose={() => { if (!submitting) setActionModal(null); }}
        onConfirm={submitAction}
        title={actionModal ? (
          actionModal.action === 'return' ? `Return ${getItemTitle(actionModal.question)} for Revision` :
            actionModal.action === 'restore' ? 'Restore for Review' :
              `Reject ${getItemTitle(actionModal.question)}`
        ) : ''}
        confirmLabel="Submit"
        confirmVariant={actionModal && actionModal.action === 'reject' ? 'danger' : 'primary'}
        busy={submitting}
      >
        {actionModal && (
          <div>
            {actionModal.question.groupId && <p className="ca-modal-note">{getSetNotice(actionModal.question)}</p>}
            <div className="ca-form-group">
              <label className="ca-label">
                <strong>
                  {actionModal.action === 'return' ? 'Revision Note (required)' :
                    actionModal.action === 'restore' ? 'Restore Feedback (required)' :
                      'Rejection Reason (required)'}
                </strong>
              </label>
              <textarea
                className="ca-textarea"
                rows="5"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  actionModal.action === 'return' ? 'Explain what needs to be fixed...' :
                    actionModal.action === 'restore' ? 'Explain why you are sending this back for review...' :
                      'Explain why this question is being rejected...'
                }
                autoFocus
              />
            </div>
          </div>
        )}
      </ConfirmationModal>

      {/* Bulk Return / Reject / Restore Modal */}
      <ConfirmationModal
        open={!!bulkActionModal}
        onClose={() => { if (!bulkSubmitting) { setBulkActionModal(null); setNote(''); } }}
        onConfirm={handleBulkSubmitAction}
        title={bulkActionModal ? (
          bulkActionModal === 'return' ? `Return ${selectedIds.size} Question${selectedIds.size > 1 ? 's' : ''} for Revision` :
            bulkActionModal === 'restore' ? `Restore ${selectedIds.size} Question${selectedIds.size > 1 ? 's' : ''} for Revision` :
              `Reject ${selectedIds.size} Question${selectedIds.size > 1 ? 's' : ''}`
        ) : ''}
        confirmLabel="Submit"
        confirmVariant={bulkActionModal === 'reject' ? 'danger' : 'primary'}
        busy={bulkSubmitting}
      >
        {bulkActionModal && (
          <div>
            <p className="ca-modal-note">
              This {bulkActionModal === 'return' ? 'revision note' : bulkActionModal === 'restore' ? 'restore feedback' : 'rejection reason'} will be applied to all {selectedIds.size} selected question{selectedIds.size > 1 ? 's' : ''}.
            </p>
            <div className="ca-form-group">
              <label className="ca-label">
                <strong>
                  {bulkActionModal === 'return' ? 'Revision Note (required)' :
                    bulkActionModal === 'restore' ? 'Restore Feedback (required)' :
                      'Rejection Reason (required)'}
                </strong>
              </label>
              <textarea
                className="ca-textarea"
                rows="5"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  bulkActionModal === 'return' ? 'Explain what needs to be fixed...' :
                    bulkActionModal === 'restore' ? 'Explain why you are sending these back for review...' :
                      'Explain why these questions are being rejected...'
                }
                autoFocus
              />
            </div>
          </div>
        )}
      </ConfirmationModal>

      {/* Simple Confirm Modal (approve / reuse / delete / bulk approve) */}
      {confirmModal && (
        <ConfirmationModal
          open={!!confirmModal}
          onClose={() => { if (!submitting && !bulkSubmitting) setConfirmModal(null); }}
          onConfirm={performConfirm}
          title={(() => {
            if (!confirmModal) return '';
            if (confirmModal.action === 'approve') return `Approve this ${getItemNoun(confirmModal.question)}?`;
            if (confirmModal.action === 'reuse') return `Mark this question for reuse?`;
            if (confirmModal.action === 'delete') return `Delete this ${getItemNoun(confirmModal.question)}?`;
            if (confirmModal.action === 'bulkApprove') return `Approve ${selectedIds.size} question${selectedIds.size > 1 ? 's' : ''}?`;
            return '';
          })()}
          message={(() => {
            if (!confirmModal) return null;
            const setNotice = getSetNotice(confirmModal.question);
            if (confirmModal.action === 'reuse') return 'This makes it selectable for new exams without sending it back to the creator.';
            if (confirmModal.action === 'approve' || confirmModal.action === 'bulkApprove') return `${setNotice} This cannot be undone.`.trim();
            if (confirmModal.action === 'delete') return `${setNotice} This action is permanent and cannot be undone.`.trim();
            return null;
          })()}
          confirmLabel={confirmModal.action === 'delete' ? 'Delete' : 'Confirm'}
          confirmVariant={confirmModal.action === 'delete' ? 'danger' : 'primary'}
          busy={confirmModal.action === 'bulkApprove' ? bulkSubmitting : submitting}
        />
      )}

      {/* Concurrency Warning Modal */}
      {warningModal && (
        <div className="ca-modal-overlay">
          <div className="ca-modal ca-modal--warning">
            <div className="ca-modal-header ca-modal-header--warning">
              <h3>⚠️ Question Being Reviewed</h3>
              <button className="ca-modal-close" onClick={() => setWarningModal(null)} type="button">x</button>
            </div>
            <div className="ca-modal-body">
              <div className="ca-warning-content">
                <div className="ca-warning-icon">🔍</div>
                <p className="ca-warning-text">
                  <strong>{warningModal.reviewer.name}</strong> ({formatRoleLabel(warningModal.reviewer.role)}) has been reviewing this question for <strong>{warningModal.minutesElapsed} minute{warningModal.minutesElapsed !== 1 ? 's' : ''}</strong>. Proceeding may cause a conflict.
                </p>
              </div>
            </div>
            <div className="ca-modal-footer">
              <button className="ca-btn-cancel" onClick={() => setWarningModal(null)}>Go Back</button>
              <button className="ca-btn-submit ca-btn-submit--warning" onClick={handleWarningProceed}>Evaluate Anyway</button>
            </div>
          </div>
        </div>
      )}

      {fullscreenImage && (
        <div className="ca-image-overlay" onClick={() => setFullscreenImage(null)}>
          <div className="ca-image-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ca-image-close" onClick={() => setFullscreenImage(null)}>Close</button>
            <AuthImage src={fullscreenImage} alt="Question preview" className="ca-image-full" />
          </div>
        </div>
      )}

      {/* Return Approved Question to Creator Modal */}
      <ConfirmationModal
        open={!!returnModal}
        onClose={() => {
          if (returnSubmitting) return;
          setReturnModal(null);
          setReturnNote('');
          setReturnError('');
        }}
        onConfirm={submitReturnToCreator}
        title={`Return ${getItemTitle(returnModal)} to Creator?`}
        confirmLabel={returnSubmitting ? 'Submitting...' : `Return ${getItemTitle(returnModal)}`}
        confirmVariant="primary"
        busy={returnSubmitting}
      >
        {returnModal && (
          <div>
            {returnModal.groupId && <p className="ca-modal-note">{getSetNotice(returnModal)}</p>}
            <div className="ca-form-group">
              <label className="ca-label">
                <strong>Feedback for Creator (required)</strong>
              </label>
              <textarea
                className="ca-textarea"
                rows="5"
                value={returnNote}
                onChange={(e) => { setReturnNote(e.target.value); if (returnError) setReturnError(''); }}
                placeholder="Explain what the creator should revise or improve..."
                autoFocus
              />
            </div>
            {returnError && <p style={{ color: '#ef4444', fontSize: '13px', margin: '4px 0 0' }}>{returnError}</p>}
          </div>
        )}
      </ConfirmationModal>
    </main>
  );
}
