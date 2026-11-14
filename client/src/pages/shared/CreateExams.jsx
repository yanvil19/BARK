import AuthImage from '../../components/AuthImage.jsx';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiAuth } from '../../lib/api.js';
import { organizeQuestionAnswers } from '../../lib/DeanTestRunOrganizer.js';
import { getStatusLabel } from '../../utils/statusLabels.js';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import DateTimePicker from '../../components/DateTimePicker.jsx';
import FieldCheck from '../../components/FieldCheck.jsx';
import ImportReviewBubbles from '../../components/ImportReviewBubbles.jsx';
import QuestionDetailPanels from '../../components/QuestionDetailPanels.jsx';
import { Modal } from '../../components/Modal.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import PanelHeader from '../../components/PanelHeader.jsx';
import { Marker, MarkerIcon, MarkerLegend, USED_IN_EXAM_ICON } from '../../components/QuestionMarkers.jsx';
import SearchBar from '../../components/SearchBar.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import SafeHtml, { truncateHtml } from '../../components/SafeHtml.jsx';
import usePanelLayout from '../../hooks/usePanelLayout.js';
// The Questions tab lists its questions with the shared list and panel (ca- classes)
import '../../styles/shared/QuestionApprovals.css';
import '../../styles/shared/CreateExams.css';
// After the form's styles. Its own (MockBoardExamPreview.css) share no selectors with any other file,
// so loading them here moves nothing in the cascade.
import MockBoardExamTestRun from './BoardExamTestRun.jsx';
import { ONE_WAY_RULE_ICON, POINTS_RULE_ICON, QUESTIONS_ICON, RESET_ICON, TIMER_RULE_ICON } from '../../components/ExamRuleIcons.jsx';
import SetMemberRows from '../../components/SetMemberRows.jsx';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;
const EXAM_CREATE_DRAFT_KEY = 'draft_exam_create';
const EMPTY_EXAM_FORM = {
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
  // Question settings: 'equal' scores 1 point a question, 'custom' uses each question's points
  scoringMode: 'equal',
  defaultQuestionPoints: 1,
  questionTimerEnabled: false,
  defaultQuestionSeconds: 120,
  // One question at a time, each answered before the next; the second lets takers go back
  oneWayNavigation: false,
  oneWayBackAllowed: false,
};

// The server's limits for a question's points and time
const QUESTION_POINTS_MIN = 1;
const QUESTION_POINTS_MAX = 100;
const QUESTION_SECONDS_MIN = 10;
const QUESTION_SECONDS_MAX = 3600;

function isValidQuestionPoints(value) {
  if (value === '' || value === null || value === undefined) return false;
  const points = Number(value);
  return Number.isInteger(points) && points >= QUESTION_POINTS_MIN && points <= QUESTION_POINTS_MAX;
}

function isValidQuestionSeconds(value) {
  return Number.isInteger(value) && value >= QUESTION_SECONDS_MIN && value <= QUESTION_SECONDS_MAX;
}

// "1 hour 42 minutes 30 seconds", for the question timers' total
function formatDurationFromSeconds(value) {
  const total = Number(value);
  if (!Number.isFinite(total) || total <= 0) return '';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (seconds) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  return parts.join(' ');
}

// An exam timed by its questions ends when their time is up, rounded up to the whole minute (as the server does)
function examEndFromQuestionTimes(startTime, totalSeconds) {
  return Math.ceil((startTime + totalSeconds * 1000) / 60000) * 60000;
}

// Points or seconds typed in a box: a number once it reads as one, '' while empty
function readNumberInput(raw) {
  return raw === '' ? '' : Number(raw);
}

function splitQuestionSeconds(value) {
  if (!Number.isInteger(value) || value < 0) return { minutes: '', seconds: '' };
  return { minutes: String(Math.floor(value / 60)), seconds: String(value % 60).padStart(2, '0') };
}

// Whole seconds from the minute and second boxes, or null while they don't make a time
function joinQuestionSeconds(minutes, seconds) {
  if (minutes === '' && seconds === '') return null;
  const wholeMinutes = minutes === '' ? 0 : Number(minutes);
  const wholeSeconds = seconds === '' ? 0 : Number(seconds);
  if (!Number.isInteger(wholeMinutes) || !Number.isInteger(wholeSeconds)) return null;
  if (wholeMinutes < 0 || wholeSeconds < 0 || wholeSeconds > 59) return null;
  return wholeMinutes * 60 + wholeSeconds;
}

// Minute and second boxes for a question's time. The boxes keep what was typed, so a
// half-typed time isn't rewritten under the cursor; a time set from outside, such as by
// "Apply to all", replaces them.
function QuestionTimeInput({ value, onChange, label, invalid = false, ownValue = false }) {
  const [parts, setParts] = useState(() => splitQuestionSeconds(value));

  useEffect(() => {
    if (joinQuestionSeconds(parts.minutes, parts.seconds) === value) return;
    setParts(splitQuestionSeconds(value));
  }, [parts, value]);

  function update(nextParts) {
    setParts(nextParts);
    onChange(joinQuestionSeconds(nextParts.minutes, nextParts.seconds));
  }

  return (
    <span
      className={`mbe-time-input${invalid ? ' is-invalid' : ''}${ownValue ? ' has-own-value' : ''}`}
      role="group"
      aria-label={label}
    >
      <input
        className="mbe-input"
        type="number"
        min="0"
        max="60"
        step="1"
        inputMode="numeric"
        value={parts.minutes}
        onChange={(e) => update({ ...parts, minutes: e.target.value })}
        aria-label={`${label}, minutes`}
        aria-invalid={invalid}
      />
      <span className="mbe-time-unit" aria-hidden="true">min</span>
      <input
        className="mbe-input"
        type="number"
        min="0"
        max="59"
        step="1"
        inputMode="numeric"
        value={parts.seconds}
        onChange={(e) => update({ ...parts, seconds: e.target.value })}
        aria-label={`${label}, seconds`}
        aria-invalid={invalid}
      />
      <span className="mbe-time-unit" aria-hidden="true">sec</span>
    </span>
  );
}

function readExamCreateDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(EXAM_CREATE_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Failed to restore exam creation draft:', err);
    return null;
  }
}

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

// A question's points and time in this exam: its own, or the exam's default
function resolveQuestionSettings(questionId, form, itemOverrides) {
  const own = itemOverrides[questionId] || {};
  return {
    points: 'points' in own ? own.points : form.defaultQuestionPoints,
    seconds: 'seconds' in own ? own.seconds : form.defaultQuestionSeconds,
    hasOwnPoints: 'points' in own,
    hasOwnSeconds: 'seconds' in own,
  };
}

// What an opened exam's changes are compared against, to tell whether closing it loses anything
function examEditSnapshot(form, programId, tagIds, questions, itemOverrides) {
  return JSON.stringify({
    form,
    programId: String(programId || ''),
    tagIds: tagIds.map(String).sort(),
    questions: questions.map((question) => {
      const id = String(question._id);
      const { points, seconds } = resolveQuestionSettings(id, form, itemOverrides);
      return [id, points, seconds];
    }),
  });
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

// Questions about to join the exam, with each set's together and in set order where its first
// question stood, so a set's exam numbers follow its order (the approved list comes newest first)
function inSetOrder(questions) {
  const sets = new Map();
  const items = [];
  questions.forEach((question) => {
    if (!question.groupId) {
      items.push(question);
      return;
    }
    if (!sets.has(question.groupId)) {
      sets.set(question.groupId, []);
      items.push(sets.get(question.groupId));
    }
    sets.get(question.groupId).push(question);
  });
  return items.flatMap((item) => (Array.isArray(item)
    ? [...item].sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0))
    : [item]));
}

// "1 min 30 sec": a question's time, short enough for its card
function formatShortDuration(value) {
  if (!Number.isInteger(value) || value < 0) return '';
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return [minutes ? `${minutes} min` : '', seconds ? `${seconds} sec` : ''].filter(Boolean).join(' ') || '0 sec';
}

// Brings a list's open card into view inside the list's own scroll, leaving the form where it is
function revealActiveCard(listEl) {
  // In an open set, the row of the question shown rather than the set's card
  const card = listEl?.querySelector('.ca-set-row.is-active') || listEl?.querySelector('.is-active');
  if (!card) return;
  const list = listEl.getBoundingClientRect();
  const rect = card.getBoundingClientRect();
  if (rect.top < list.top) listEl.scrollTop -= list.top - rect.top + 12;
  else if (rect.bottom > list.bottom) listEl.scrollTop += rect.bottom - list.bottom + 12;
}

// Previous and next arrows in a preview panel's header, through the list it was opened from
function PanelStepper({ index, total, onStep }) {
  return (
    <div className="ca-bulk-nav">
      <button
        type="button"
        className="ca-bulk-nav-btn"
        onClick={() => onStep(index - 1)}
        disabled={index <= 0}
        title="Previous question"
        aria-label="Previous question"
      >
        ←
      </button>
      <span className="ca-bulk-nav-label">{index + 1} / {total}</span>
      <button
        type="button"
        className="ca-bulk-nav-btn"
        onClick={() => onStep(index + 1)}
        disabled={index >= total - 1}
        title="Next question"
        aria-label="Next question"
      >
        →
      </button>
    </div>
  );
}

// An on/off switch for one of the exam's rules. It is a checkbox underneath, named by its label.
function RuleSwitch({ checked, onChange, label }) {
  return (
    <label className={`mbe-switch${checked ? ' is-on' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="mbe-switch-track" aria-hidden="true"><span className="mbe-switch-thumb" /></span>
      <span className="mbe-switch-text" aria-hidden="true">{checked ? 'On' : 'Off'}</span>
    </label>
  );
}

// The open question's points and time, framed in the panel's header beside the arrows. A value
// of its own is outlined and offers a button back to the exam's; a rule that is off shows what
// the question gets instead.
function QuestionSettingFields({ number, setting, usesCustomPoints, usesQuestionTimer, defaultPoints, defaultSeconds, onSetOwnValue }) {
  const frameClass = (hasOwn, valid) => ['mbe-panel-setting', hasOwn ? 'is-own' : '', valid ? '' : 'is-invalid'].filter(Boolean).join(' ');
  const pointsNote = !setting.pointsValid
    ? `Whole numbers from ${QUESTION_POINTS_MIN} to ${QUESTION_POINTS_MAX}`
    : setting.hasOwnPoints ? 'Its own points' : 'Same as Points per question';
  const timeNote = !setting.secondsValid
    ? 'From 10 seconds to 60 minutes'
    : setting.hasOwnSeconds ? 'Its own time' : 'Same as Time per question';

  return (
    <div className="mbe-panel-settings" role="group" aria-label={`Points and time for question ${number}`}>
      {usesCustomPoints ? (
        <div className={frameClass(setting.hasOwnPoints, setting.pointsValid)} title={pointsNote}>
          <label className="mbe-panel-setting-label" htmlFor="mbe-own-points">Points</label>
          <input
            id="mbe-own-points"
            className={`mbe-input${setting.pointsValid ? '' : ' is-invalid'}`}
            type="number"
            min={QUESTION_POINTS_MIN}
            max={QUESTION_POINTS_MAX}
            step="1"
            inputMode="numeric"
            value={setting.points}
            onChange={(e) => onSetOwnValue('points', readNumberInput(e.target.value))}
            aria-label={`Points for question ${number}`}
            aria-invalid={!setting.pointsValid}
          />
          {setting.hasOwnPoints && (
            <button
              type="button"
              className="mbe-panel-setting-reset"
              onClick={() => onSetOwnValue('points', defaultPoints)}
              title={`Use Points per question (${defaultPoints})`}
              aria-label="Use Points per question"
            >
              {RESET_ICON}
            </button>
          )}
        </div>
      ) : (
        <div className="mbe-panel-setting is-static" title="Every question is worth 1 point. Turn on custom points to change it.">
          <span className="mbe-panel-setting-label">Points</span>
          <span className="mbe-panel-setting-value">1</span>
        </div>
      )}

      {usesQuestionTimer ? (
        <div className={frameClass(setting.hasOwnSeconds, setting.secondsValid)} title={timeNote}>
          <span className="mbe-panel-setting-label" aria-hidden="true">Time</span>
          <QuestionTimeInput
            value={setting.seconds}
            onChange={(seconds) => onSetOwnValue('seconds', seconds)}
            label={`Time for question ${number}`}
            invalid={!setting.secondsValid}
          />
          {setting.hasOwnSeconds && (
            <button
              type="button"
              className="mbe-panel-setting-reset"
              onClick={() => onSetOwnValue('seconds', defaultSeconds)}
              title={`Use Time per question (${formatShortDuration(defaultSeconds) || 'not set'})`}
              aria-label="Use Time per question"
            >
              {RESET_ICON}
            </button>
          )}
        </div>
      ) : (
        <div className="mbe-panel-setting is-static" title="Questions have no time limit. Turn on the question timer to change it.">
          <span className="mbe-panel-setting-label">Time</span>
          <span className="mbe-panel-setting-value">No limit</span>
        </div>
      )}
    </div>
  );
}

// The markers on the Questions tab's cards, and the legends above the lists that explain them
const IN_EXAM_ICON = <MarkerIcon><path d="M5 12.5l4.5 4.5L19 7.5" /></MarkerIcon>;
const OWN_VALUE_ICON = <MarkerIcon><path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" /></MarkerIcon>;
const APPROVED_LEGEND = [
  { text: 'Questions in a set', className: 'ca-marker--count', content: '#' },
  { text: 'In this exam', className: 'mbe-marker--in-exam', content: IN_EXAM_ICON },
  { text: 'Used in an exam', className: 'ca-marker--used', content: USED_IN_EXAM_ICON },
];
const SETTINGS_LEGEND = [
  { text: 'Questions in a set', className: 'ca-marker--count', content: '#' },
  { text: 'Own points or time', className: 'mbe-marker--own', content: OWN_VALUE_ICON },
  { text: 'Needs fixing', className: 'mbe-marker--problem', content: '!' },
];

// The exam form. The Create Exam page shows it for a new exam (variant 'page'); Board Exams
// shows it in a window to edit the exam with examId (variant 'modal'), with the window's own
// Cancel and Save Changes pinned at the bottom.
export function ExamForm({ me, examId = '', variant = 'page', onSaved, onCancel, onDirtyChange, onTestRun }) {
  const isEditing = !!examId;
  const isModal = variant === 'modal';
  const initialDraftRef = useRef(isEditing ? null : readExamCreateDraft());

  const [programs, setPrograms] = useState([]);
  const [programId, setProgramId] = useState(() => initialDraftRef.current?.programId || '');
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState(() => (
    Array.isArray(initialDraftRef.current?.selectedTagIds) ? initialDraftRef.current.selectedTagIds : []
  ));
  const [approvedQuestions, setApprovedQuestions] = useState([]);
  const [selectedQuestions, setSelectedQuestions] = useState(() => (
    Array.isArray(initialDraftRef.current?.selectedQuestions) ? initialDraftRef.current.selectedQuestions : []
  ));
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackByQuestionId, setFeedbackByQuestionId] = useState({});
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [questionFilterTagId, setQuestionFilterTagId] = useState('');
  const [approvedSelectionFilter, setApprovedSelectionFilter] = useState('all');
  // 'all' | 'single' | 'group' — capsule filter above the approved questions
  const [questionTypeFilter, setQuestionTypeFilter] = useState('all');
  const [questionStateFilter, setQuestionStateFilter] = useState('all');
  // The approved question or set shown in the preview panel: 'q:<id>' or 'set:<groupId>'
  const [approvedOpenKey, setApprovedOpenKey] = useState(null);
  const [returnModal, setReturnModal] = useState(null);
  const [returnNote, setReturnNote] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [bulkSelectedIds, setBulkSelectedIds] = useState(new Set());
  const [filteredBulkModal, setFilteredBulkModal] = useState(null); // 'add' | 'remove' | null
  // groupId -> index of the question shown behind the set's numbered bubbles
  const [activeGroupIdx, setActiveGroupIdx] = useState({});
  // Subject search + pagination
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectPage, setSubjectPage] = useState(1);
  const SUBJECTS_PER_PAGE = 8;
  // Approved questions pagination: a card a question or a set, as on the other list pages
  const [questionPage, setQuestionPage] = useState(1);
  const QUESTIONS_PER_PAGE = 10;
  const approvedListRef = useRef(null);
  // TODO: temporary demo pattern - for production, consider autosaving drafts to the backend instead of localStorage, since this content is confidential and shouldn't persist client-side long-term
  const [form, setForm] = useState(() => (
    initialDraftRef.current?.form && typeof initialDraftRef.current.form === 'object'
      ? { ...EMPTY_EXAM_FORM, ...initialDraftRef.current.form }
      : EMPTY_EXAM_FORM
  ));

  // Points and times that questions have of their own, instead of the exam's defaults:
  // { [questionId]: { points?, seconds? } }
  const [itemOverrides, setItemOverrides] = useState(() => {
    const saved = initialDraftRef.current?.itemOverrides;
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  });

  // Active tab state: 'details' | 'subjects' | 'questions' | 'review'
  const [activeTab, setActiveTab] = useState('details');
  // What the Questions tab shows: 'approved' (pick questions) | 'settings' (points and timers)
  const [questionView, setQuestionView] = useState('approved');
  // Question Settings' filters, the same kinds as Approved Questions': type, search, subject, and
  // whether a question has its own value or one that needs fixing
  const [settingsSubjectFilterId, setSettingsSubjectFilterId] = useState('');
  const [settingsTypeFilter, setSettingsTypeFilter] = useState('all');
  const [settingsSearch, setSettingsSearch] = useState('');
  const [settingsStateFilter, setSettingsStateFilter] = useState('all');
  function clearSettingsFilters() {
    setSettingsSubjectFilterId('');
    setSettingsTypeFilter('all');
    setSettingsSearch('');
    setSettingsStateFilter('all');
  }
  // The exam's questions under Question Settings: the page, and the one open in the panel
  const [settingsPage, setSettingsPage] = useState(1);
  const SETTINGS_PER_PAGE = 10;
  const [settingsOpenId, setSettingsOpenId] = useState(null);
  const settingsListRef = useRef(null);
  // Set when a save stops on a bad point or time, so the first one is scrolled into view
  const revealInvalidSettingRef = useRef(false);
  // 'points' | 'seconds' while "Apply to all" asks before replacing questions' own values
  const [applyAllSetting, setApplyAllSetting] = useState(null);

  useEffect(() => {
    if (isEditing) return;
    const id = setTimeout(() => {
      try {
        const hasDraft =
          Boolean(programId) ||
          selectedTagIds.length > 0 ||
          selectedQuestions.length > 0 ||
          Object.keys(itemOverrides).length > 0 ||
          JSON.stringify(form) !== JSON.stringify(EMPTY_EXAM_FORM);

        if (!hasDraft) {
          window.localStorage.removeItem(EXAM_CREATE_DRAFT_KEY);
          return;
        }

        window.localStorage.setItem(EXAM_CREATE_DRAFT_KEY, JSON.stringify({
          programId,
          selectedTagIds,
          selectedQuestions,
          form,
          itemOverrides,
        }));
      } catch (err) {
        console.warn('Failed to save exam creation draft:', err);
      }
    }, 500);
    return () => clearTimeout(id);
  }, [form, isEditing, itemOverrides, programId, selectedQuestions, selectedTagIds]);

  const isAlumniExam = (form.targetAudience || 'student') === 'alumni';

  // ─── Question settings: each selected question's points and time ──────────
  const usesCustomPoints = form.scoringMode === 'custom';
  const usesQuestionTimer = Boolean(form.questionTimerEnabled);
  const usesOneWay = Boolean(form.oneWayNavigation);
  const questionSettings = useMemo(() => selectedQuestions.map((question) => {
    const id = String(question._id);
    const resolved = resolveQuestionSettings(id, form, itemOverrides);
    return {
      id,
      ...resolved,
      pointsValid: isValidQuestionPoints(resolved.points),
      secondsValid: isValidQuestionSeconds(resolved.seconds),
    };
  }), [form, itemOverrides, selectedQuestions]);
  const settingsByQuestionId = useMemo(
    () => new Map(questionSettings.map((setting) => [setting.id, setting])),
    [questionSettings]
  );
  const totalPoints = usesCustomPoints
    ? questionSettings.reduce((sum, setting) => sum + (setting.pointsValid ? Number(setting.points) : 0), 0)
    : selectedQuestions.length;
  const totalQuestionSeconds = usesQuestionTimer
    ? questionSettings.reduce((sum, setting) => sum + (setting.secondsValid ? setting.seconds : 0), 0)
    : 0;
  const ownPointsCount = questionSettings.filter((setting) => setting.hasOwnPoints).length;
  const ownSecondsCount = questionSettings.filter((setting) => setting.hasOwnSeconds).length;
  const pointsSettingsValid = !usesCustomPoints || (
    isValidQuestionPoints(form.defaultQuestionPoints) && questionSettings.every((setting) => setting.pointsValid)
  );
  const timerSettingsValid = !usesQuestionTimer || (
    isValidQuestionSeconds(form.defaultQuestionSeconds) && questionSettings.every((setting) => setting.secondsValid)
  );
  const questionSettingsValid = pointsSettingsValid && timerSettingsValid;
  // A student exam timed by its questions ends when their time is up; an alumni attempt
  // is limited to their total instead, and its window keeps the end that was picked
  const endFollowsQuestionTimes = usesQuestionTimer && !isAlumniExam;
  const attemptTimedByQuestions = usesQuestionTimer && isAlumniExam;

  useEffect(() => {
    if (!endFollowsQuestionTimes || totalQuestionSeconds <= 0) return;
    const start = form.startDateTime ? new Date(form.startDateTime).getTime() : NaN;
    if (!Number.isFinite(start)) return;
    const end = examEndFromQuestionTimes(start, totalQuestionSeconds);
    setForm((prev) => {
      const prevEnd = prev.endDateTime ? new Date(prev.endDateTime).getTime() : NaN;
      return prevEnd === end ? prev : { ...prev, endDateTime: new Date(end).toISOString() };
    });
  }, [endFollowsQuestionTimes, form.startDateTime, totalQuestionSeconds]);

  // A question's own points or time; typing the default back makes it follow the default again
  function setQuestionOwnValue(questionId, key, value) {
    const defaultValue = key === 'points' ? form.defaultQuestionPoints : form.defaultQuestionSeconds;
    setItemOverrides((prev) => {
      const own = { ...(prev[questionId] || {}) };
      if (value === defaultValue) delete own[key];
      else own[key] = value;
      const next = { ...prev };
      if (Object.keys(own).length > 0) next[questionId] = own;
      else delete next[questionId];
      return next;
    });
  }

  // "Apply to all": every question takes the default again
  function applyDefaultToAll(key) {
    setItemOverrides((prev) => {
      const next = {};
      Object.entries(prev).forEach(([questionId, own]) => {
        const rest = { ...own };
        delete rest[key];
        if (Object.keys(rest).length > 0) next[questionId] = rest;
      });
      return next;
    });
    setApplyAllSetting(null);
  }

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

  // Re-check schedule validity as time passes (a start time can slip into the past)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // ─── Details field checks (grey → green once valid) ────────────────────────
  // Schedule rules mirror the server's publish checks: start in the future, end after start.
  const startTime = form.startDateTime ? new Date(form.startDateTime).getTime() : NaN;
  const endTime = form.endDateTime ? new Date(form.endDateTime).getTime() : NaN;
  const timeLimit = form.timeLimitMinutes === '' ? NaN : Number(form.timeLimitMinutes);
  const threshold = form.passingThreshold === '' ? NaN : Number(form.passingThreshold);
  const fieldValid = {
    name: (form.name || '').trim() !== '',
    program: Boolean(programId),
    start: Number.isFinite(startTime) && startTime > now,
    end: Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime && endTime > now,
    timeLimit: Number.isFinite(timeLimit) && timeLimit >= 1,
    passingThreshold: Number.isFinite(threshold) && threshold >= 0 && threshold <= 100,
    description: (form.description || '').trim() !== '',
    instructions: (form.instructions || '').trim() !== '',
  };

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

        if (!examId && deptPrograms.length === 1) setProgramId(deptPrograms[0]._id);

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
  }, [examId, me]);

  // The exam being edited as it was loaded, its name and status, and why it couldn't load
  const [loadedSnapshot, setLoadedSnapshot] = useState(null);
  const [loadedName, setLoadedName] = useState('');
  const [loadedStatus, setLoadedStatus] = useState('');
  const [loadError, setLoadError] = useState('');
  const isLoadingExam = isEditing && loadedSnapshot === null && !loadError;

  useEffect(() => {
    if (!examId) return undefined;
    let ignore = false;

    async function loadExamForEdit() {
      try {
        const data = await apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(examId)}`);
        if (ignore) return;
        const exam = data.exam;
        const nextProgramId = exam.program?._id || exam.program || '';
        const nextTagIds = (exam.subjectTags || []).map((tag) => tag._id || tag);
        const nextQuestions = (exam.questions || []).map((question) => ({
          ...question,
          tagId: question.tag?._id || question.tag,
        }));
        const nextForm = {
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
          scoringMode: exam.scoringMode === 'custom' ? 'custom' : 'equal',
          defaultQuestionPoints: exam.defaultQuestionPoints ?? EMPTY_EXAM_FORM.defaultQuestionPoints,
          questionTimerEnabled: Boolean(exam.questionTimerEnabled),
          defaultQuestionSeconds: exam.defaultQuestionSeconds ?? EMPTY_EXAM_FORM.defaultQuestionSeconds,
          oneWayNavigation: Boolean(exam.oneWayNavigation),
          oneWayBackAllowed: Boolean(exam.oneWayBackAllowed),
        };
        // The exam keeps every question's points and time; those that differ from the defaults are their own
        const nextOverrides = {};
        (exam.itemSettings || []).forEach((item) => {
          const own = {};
          if (item.points != null && item.points !== nextForm.defaultQuestionPoints) own.points = item.points;
          if (item.timeLimitSeconds != null && item.timeLimitSeconds !== nextForm.defaultQuestionSeconds) {
            own.seconds = item.timeLimitSeconds;
          }
          if (Object.keys(own).length > 0) nextOverrides[String(item.question?._id || item.question)] = own;
        });

        setProgramId(nextProgramId);
        setSelectedTagIds(nextTagIds);
        setSelectedQuestions(nextQuestions);
        setForm(nextForm);
        setItemOverrides(nextOverrides);
        setLoadedName(nextForm.name);
        setLoadedStatus(nextForm.status);
        setLoadedSnapshot(examEditSnapshot(nextForm, nextProgramId, nextTagIds, nextQuestions, nextOverrides));
      } catch (err) {
        if (!ignore) setLoadError(err.message || 'Failed to load mock board exam.');
      }
    }

    loadExamForEdit();
    return () => {
      ignore = true;
    };
  }, [examId]);

  // Unsaved changes to the exam being edited, so the window can ask before closing
  const editSnapshot = useMemo(
    () => (isEditing ? examEditSnapshot(form, programId, selectedTagIds, selectedQuestions, itemOverrides) : null),
    [form, isEditing, itemOverrides, programId, selectedQuestions, selectedTagIds]
  );
  const hasUnsavedEdits = loadedSnapshot !== null && editSnapshot !== loadedSnapshot;
  // Told during the commit, so an Escape straight after typing already knows about the change
  useLayoutEffect(() => {
    onDirtyChange?.(hasUnsavedEdits);
  }, [hasUnsavedEdits, onDirtyChange]);

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
    const filtered = approvedQuestions
      .map((question) => organizeQuestionAnswers(question))
      .filter((question) => {
        const matchesSearch = !needle || [question.description, question.tag?.name, question.createdBy?.name]
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
        const matchesType =
          questionTypeFilter === 'all' ||
          (questionTypeFilter === 'single' && !question.groupId) ||
          (questionTypeFilter === 'group' && Boolean(question.groupId));

        return matchesSearch && matchesTag && matchesSelection && matchesState && matchesType;
      });

    // Keep questions belonging to the same group contiguous and ordered by groupOrder
    const groupClusters = new Map();
    const result = [];
    for (const q of filtered) {
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
  }, [approvedQuestions, approvedSelectionFilter, questionFilterTagId, searchQuery, selectedQuestionIds, questionStateFilter, questionTypeFilter]);

  // Capsule counts are question counts across every loaded approved question
  const questionTypeCounts = useMemo(() => {
    const group = approvedQuestions.filter((question) => question.groupId).length;
    return { all: approvedQuestions.length, single: approvedQuestions.length - group, group };
  }, [approvedQuestions]);

  const filteredSubjectOptions = useMemo(
    () => subjectOptions.filter((tag) => selectedTagIds.includes(String(tag._id))),
    [selectedTagIds, subjectOptions]
  );

  useEffect(() => {
    if (!questionFilterTagId) return;
    const stillExists = filteredSubjectOptions.some((tag) => String(tag._id) === String(questionFilterTagId));
    if (!stillExists) setQuestionFilterTagId('');
  }, [filteredSubjectOptions, questionFilterTagId]);

  useEffect(() => {
    if (!settingsSubjectFilterId) return;
    const stillExists = filteredSubjectOptions.some((tag) => String(tag._id) === String(settingsSubjectFilterId));
    if (!stillExists) setSettingsSubjectFilterId('');
  }, [filteredSubjectOptions, settingsSubjectFilterId]);

  // ─── Approved Questions: a card for each question, and one for each set ────
  // A set's card holds every question in it, in set order, since a set is added whole
  const setMembersOf = (groupId) => approvedQuestions
    .filter((question) => question.groupId === groupId)
    .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0))
    .map((question) => organizeQuestionAnswers(question));
  const approvedCards = useMemo(() => {
    const cards = [];
    const listedSets = new Set();
    filteredApprovedQuestions.forEach((question) => {
      if (!question.groupId) {
        cards.push({ key: `q:${question._id}`, question, members: [question], isSet: false });
        return;
      }
      if (listedSets.has(question.groupId)) return;
      listedSets.add(question.groupId);
      const members = setMembersOf(question.groupId);
      cards.push({ key: `set:${question.groupId}`, question: members[0] || question, members, isSet: true });
    });
    return cards;
    // setMembersOf only reads approvedQuestions
  }, [approvedQuestions, filteredApprovedQuestions]);

  // The open card, kept open while a filter hides it, until it leaves the approved questions
  const approvedOpenItem = useMemo(() => {
    if (!approvedOpenKey) return null;
    const listed = approvedCards.find((card) => card.key === approvedOpenKey);
    if (listed) return listed;
    const id = approvedOpenKey.slice(approvedOpenKey.indexOf(':') + 1);
    if (approvedOpenKey.startsWith('set:')) {
      const members = setMembersOf(id);
      return members.length > 0 ? { key: approvedOpenKey, question: members[0], members, isSet: true } : null;
    }
    const question = approvedQuestions.find((item) => String(item._id) === id);
    return question
      ? { key: approvedOpenKey, question: organizeQuestionAnswers(question), members: [organizeQuestionAnswers(question)], isSet: false }
      : null;
  }, [approvedCards, approvedOpenKey, approvedQuestions]);
  const approvedPanel = usePanelLayout(approvedOpenItem?.key || null);
  const approvedNavIndex = approvedOpenItem ? approvedCards.findIndex((card) => card.key === approvedOpenItem.key) : -1;

  function openApprovedCard(index) {
    const card = approvedCards[index];
    if (!card) return;
    setApprovedOpenKey(card.key);
    setQuestionPage(Math.floor(index / QUESTIONS_PER_PAGE) + 1);
  }

  // Each question's number in the exam, in the order it was added
  const examNumberById = useMemo(
    () => new Map(selectedQuestions.map((question, index) => [String(question._id), index + 1])),
    [selectedQuestions]
  );

  // ─── Question Settings: the exam's questions, keeping their exam numbers under a filter ────
  const settingRows = useMemo(() => {
    const needle = settingsSearch.trim().toLowerCase();
    return selectedQuestions
      .map((question, index) => ({ question, number: index + 1 }))
      .filter(({ question }) => {
        const questionTagId = String(question.tag?._id || question.tagId || question.tag || '');
        if (settingsSubjectFilterId && questionTagId !== String(settingsSubjectFilterId)) return false;
        if (settingsTypeFilter === 'single' && question.groupId) return false;
        if (settingsTypeFilter === 'group' && !question.groupId) return false;
        // The same fields as Approved Questions' search
        if (needle && ![question.description, question.tag?.name, question.createdBy?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)) return false;
        if (settingsStateFilter === 'all') return true;
        const setting = settingsByQuestionId.get(String(question._id));
        if (!setting) return false;
        const hasOwnValue = (usesCustomPoints && setting.hasOwnPoints) || (usesQuestionTimer && setting.hasOwnSeconds);
        const needsFixing = (usesCustomPoints && !setting.pointsValid) || (usesQuestionTimer && !setting.secondsValid);
        if (settingsStateFilter === 'own') return hasOwnValue;
        if (settingsStateFilter === 'same') return !hasOwnValue;
        return needsFixing;
      });
  }, [selectedQuestions, settingsByQuestionId, settingsSearch, settingsStateFilter, settingsSubjectFilterId, settingsTypeFilter, usesCustomPoints, usesQuestionTimer]);
  // Capsule counts are question counts across the whole exam, as Approved Questions' are
  const settingsTypeCounts = useMemo(() => {
    const group = selectedQuestions.filter((question) => question.groupId).length;
    return { all: selectedQuestions.length, single: selectedQuestions.length - group, group };
  }, [selectedQuestions]);
  // A card for each question and one for each set, as in Approved Questions. A set's card lists
  // all of its questions in this exam, in set order, when any of them matches the filters.
  function groupSettingCards(questions) {
    const cards = [];
    const listedSets = new Set();
    questions.forEach((question) => {
      if (!question.groupId) {
        cards.push({ key: `q:${question._id}`, isSet: false, members: [question] });
        return;
      }
      if (listedSets.has(question.groupId)) return;
      listedSets.add(question.groupId);
      const members = selectedQuestions
        .filter((item) => item.groupId === question.groupId)
        .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));
      cards.push({ key: `set:${question.groupId}`, isSet: true, members });
    });
    return cards;
  }
  const settingCards = useMemo(
    () => groupSettingCards(settingRows.map(({ question }) => question)),
    // groupSettingCards only reads selectedQuestions
    [selectedQuestions, settingRows]
  );
  // The listed questions in list order, which the panel's arrows step through one by one, and
  // the card each sits on, for its page
  const settingSteps = useMemo(() => settingCards.flatMap((card) => card.members), [settingCards]);
  const settingCardIndexById = useMemo(() => {
    const byId = new Map();
    settingCards.forEach((card, index) => card.members.forEach((member) => byId.set(String(member._id), index)));
    return byId;
  }, [settingCards]);
  const settingsOpenIndex = settingsOpenId
    ? selectedQuestions.findIndex((question) => String(question._id) === settingsOpenId)
    : -1;
  const settingsOpenQuestion = settingsOpenIndex >= 0 ? selectedQuestions[settingsOpenIndex] : null;
  const settingsPanel = usePanelLayout(settingsOpenQuestion ? settingsOpenId : null);
  const settingsNavIndex = settingsOpenQuestion
    ? settingSteps.findIndex((question) => String(question._id) === settingsOpenId)
    : -1;

  function openSettingStep(index) {
    const question = settingSteps[index];
    if (question) openSettingQuestion(String(question._id));
  }

  // Opens a question on its card's page when the filters list it, else just in the panel
  function openSettingQuestion(questionId) {
    setSettingsOpenId(questionId);
    const cardIndex = settingCardIndexById.get(questionId);
    if (cardIndex !== undefined) setSettingsPage(Math.floor(cardIndex / SETTINGS_PER_PAGE) + 1);
  }

  // A new page starts at the top of the list; the open card, when it is on the page, is
  // brought into view, also after the columns glide to new widths
  useEffect(() => {
    if (approvedListRef.current) approvedListRef.current.scrollTop = 0;
  }, [questionPage]);
  useEffect(() => {
    if (settingsListRef.current) settingsListRef.current.scrollTop = 0;
  }, [settingsPage]);
  useEffect(() => {
    revealActiveCard(approvedListRef.current);
  }, [approvedOpenKey, questionPage, approvedPanel.isGliding]);
  useEffect(() => {
    revealActiveCard(settingsListRef.current);
  }, [settingsOpenId, settingsPage, settingsPanel.isGliding]);

  // Takes a question out of the exam, with the rest of its set
  function removeFromExam(question) {
    const removed = new Set((question.groupId
      ? selectedQuestions.filter((item) => item.groupId === question.groupId)
      : [question]).map((item) => String(item._id)));
    setSelectedQuestions((prev) => prev.filter((item) => !removed.has(String(item._id))));
  }

  function handleTagChange(tagId) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((item) => item !== tagId) : [...prev, tagId]
    );
  }

  function handleQuestionToggle(question) {
    const isGrouped = Boolean(question.groupId);
    const relatedQuestions = isGrouped
      ? approvedQuestions.filter(q => q.groupId === question.groupId)
      : [question];

    const relatedIds = new Set(relatedQuestions.map(q => String(q._id)));
    const isAnySelected = selectedQuestions.some(item => relatedIds.has(String(item._id)));

    setSelectedQuestions((prev) => {
      if (isAnySelected) {
        // Deselect all members of this group
        return prev.filter(item => !relatedIds.has(String(item._id)));
      }
      // Add all members of this group (avoiding duplicates)
      const existingIds = new Set(prev.map(item => String(item._id)));
      const toAdd = relatedQuestions.filter(q => !existingIds.has(String(q._id)));
      return [...prev, ...inSetOrder(toAdd)];
    });
  }

  function handleBulkCheckbox(e, question) {
    e.stopPropagation();
    const isGrouped = Boolean(question.groupId);
    const relatedQuestions = isGrouped
      ? approvedQuestions.filter(q => q.groupId === question.groupId)
      : [question];
    const relatedIds = relatedQuestions.map(q => q._id);

    setBulkSelectedIds(prev => {
      const next = new Set(prev);
      const isCurrentlySelected = next.has(question._id);
      if (isCurrentlySelected) {
        relatedIds.forEach(id => next.delete(id));
      } else {
        relatedIds.forEach(id => next.add(id));
      }
      return next;
    });
  }

  function handleToggleAllFiltered() {
    const visibleIds = filteredApprovedQuestions.map(q => q._id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => bulkSelectedIds.has(id));

    if (allSelected) {
      setBulkSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setBulkSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  }

  function handleBulkAddSelected() {
    if (bulkSelectedIds.size === 0) return;
    const questionsToAdd = approvedQuestions.filter(q => bulkSelectedIds.has(q._id));
    setSelectedQuestions(prev => {
      const existingIds = new Set(prev.map(q => String(q._id)));
      const newQuestions = questionsToAdd.filter(q => !existingIds.has(String(q._id)));
      return [...prev, ...inSetOrder(newQuestions)];
    });
    setBulkSelectedIds(new Set());
  }

  function handleBulkRemoveSelected() {
    if (bulkSelectedIds.size === 0) return;
    setSelectedQuestions(prev => prev.filter(q => !bulkSelectedIds.has(q._id)));
    setBulkSelectedIds(new Set());
  }

  function handleConfirmAddFiltered() {
    setSelectedQuestions(prev => {
      const existingIds = new Set(prev.map(q => String(q._id)));
      const newQuestions = filteredApprovedQuestions.filter(q => !existingIds.has(String(q._id)));
      return [...prev, ...newQuestions];
    });
    setFilteredBulkModal(null);
  }

  function handleConfirmRemoveFiltered() {
    const filteredIds = new Set(filteredApprovedQuestions.map(q => String(q._id)));
    setSelectedQuestions(prev => prev.filter(q => !filteredIds.has(String(q._id))));
    setFilteredBulkModal(null);
  }

  function getFilterDescription() {
    const parts = [];
    if (searchQuery.trim()) parts.push(`"${searchQuery.trim()}"`);
    if (questionFilterTagId) {
      const tag = filteredSubjectOptions.find(t => String(t._id) === String(questionFilterTagId));
      if (tag) parts.push(tag.name);
    }
    if (approvedSelectionFilter === 'unselected') parts.push('not selected yet');
    if (questionTypeFilter === 'single') parts.push('single questions');
    if (questionTypeFilter === 'group') parts.push('grouped questions');
    return parts.length > 0 ? parts.join(', ') : null;
  }

  function handleReturnQuestion(question) {
    setReturnModal(question);
    setReturnNote(feedbackByQuestionId[question._id] || '');
    setReturnError('');
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
    // A missing or out-of-range point or time is shown where it is, before anything is sent
    if (!questionSettingsValid) {
      setActiveTab('questions');
      setQuestionView('settings');
      // Open the first question with a bad value, on its page, with no filter hiding it
      const firstInvalidIndex = questionSettings.findIndex((setting) => (
        (usesCustomPoints && !setting.pointsValid) || (usesQuestionTimer && !setting.secondsValid)
      ));
      if (firstInvalidIndex >= 0) {
        clearSettingsFilters();
        // Its card's page with the filters cleared, where a set counts once
        const firstInvalidId = questionSettings[firstInvalidIndex].id;
        const cardIndex = groupSettingCards(selectedQuestions)
          .findIndex((card) => card.members.some((member) => String(member._id) === firstInvalidId));
        setSettingsPage(Math.floor(Math.max(cardIndex, 0) / SETTINGS_PER_PAGE) + 1);
        setSettingsOpenId(firstInvalidId);
      }
      revealInvalidSettingRef.current = true;
      setFeedbackModal({
        title: 'Check the Question Settings',
        tone: 'warning',
        message: `Some points or times are missing or out of range. Points are whole numbers from ${QUESTION_POINTS_MIN} to ${QUESTION_POINTS_MAX}, and a question's time runs from 10 seconds to 60 minutes.`,
      });
      return;
    }
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
        status: isEditing ? (form.status || 'draft') : 'draft',
        // An alumni attempt timed by its questions is limited to their total; the server works it out too
        isTimed: isAlumniExam ? (attemptTimedByQuestions || Boolean(form.isTimed)) : false,
        timeLimitMinutes: !isAlumniExam
          ? null
          : attemptTimedByQuestions
            ? Math.max(1, Math.ceil(totalQuestionSeconds / 60))
            : form.isTimed ? Number(form.timeLimitMinutes) : null,
        passingThreshold: form.passingThreshold,
        scoringMode: usesCustomPoints ? 'custom' : 'equal',
        defaultQuestionPoints: form.defaultQuestionPoints,
        questionTimerEnabled: usesQuestionTimer,
        defaultQuestionSeconds: form.defaultQuestionSeconds,
        oneWayNavigation: usesOneWay,
        oneWayBackAllowed: Boolean(form.oneWayBackAllowed),
        // Every question's points and time, kept even while a setting is off so turning it back on restores them
        itemSettings: questionSettings.map((setting) => ({
          question: setting.id,
          points: setting.pointsValid ? Number(setting.points) : null,
          timeLimitSeconds: setting.secondsValid ? setting.seconds : null,
        })),
      };

      // An edit hands the saved exam to the window, which closes and says how it went
      if (isEditing) {
        const data = await apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(examId)}`, {
          method: 'PATCH',
          body: payload,
        });
        setLoadedSnapshot(editSnapshot);
        onSaved?.(data.exam, { previousStatus: form.status });
        return;
      }

      const data = await apiAuth(`${BASE}/api/mock-board-exams`, {
        method: 'POST',
        body: payload,
      });

      window.localStorage.removeItem(EXAM_CREATE_DRAFT_KEY);

      setForm(EMPTY_EXAM_FORM);
      setSelectedTagIds([]);
      setApprovedQuestions([]);
      setSelectedQuestions([]);
      setItemOverrides({});
      setActiveTab('details');
      setQuestionView('approved');
      setApprovedOpenKey(null);
      setQuestionPage(1);
      setSettingsOpenId(null);
      clearSettingsFilters();
      setSettingsPage(1);
      if (programs.length === 1) setProgramId(programs[0]._id);
      else setProgramId('');
      onSaved?.(data.exam);
      setFeedbackModal({
        title: 'Mock Board Exam Created',
        tone: 'success',
        message: 'The mock board exam was created successfully.',
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

  // ─── Derived helpers for Review tab ────────────────────────────────────────
  const questionsBySubject = useMemo(() => {
    const map = {};
    for (const q of selectedQuestions) {
      const tagName = q.tag?.name || 'Unknown Subject';
      if (!map[tagName]) map[tagName] = 0;
      map[tagName]++;
    }
    return map;
  }, [selectedQuestions]);

  const selectedProgram = programs.find(p => String(p._id) === String(programId));

  // ─── Tab completion indicators ──────────────────────────────────────────────
  // Details is complete when every field shown on the tab is valid (the time limit only shows
  // for timed alumni exams that aren't timed by their questions)
  const timeLimitShown = isAlumniExam && form.isTimed && !attemptTimedByQuestions;
  const detailsComplete = Object.entries(fieldValid).every(([field, valid]) => (
    field === 'timeLimit' && !timeLimitShown ? true : valid
  ));
  const subjectsComplete = selectedTagIds.length > 0;
  const questionsComplete = selectedQuestions.length > 0 && questionSettingsValid;
  const reviewComplete = detailsComplete && subjectsComplete && questionsComplete;

  // ─── Audience hero config ───────────────────────────────────────────────────
  const audienceConfig = isAlumniExam
    ? {
        label: 'ALUMNI EXAM',
        sublabel: 'Practice exam for alumni, available within the scheduled period.',
      }
    : {
        label: 'STUDENT EXAM',
        sublabel: 'Scheduled exam for currently enrolled students.',
      };

  // An exam being edited shows nothing of the form until it has loaded, so no field flashes empty
  const isFormReady = !isLoadingExam && !loadError;

  // Hands the page the exam as it stands, for a test run before it is saved, shaped like a saved
  // exam. Its clock is what a taker would get, worked out as the server does: an alumni attempt's
  // limit (or its questions' total), else the time from the student exam's start to its end.
  function openTestRun() {
    let durationMinutes = null;
    if (isAlumniExam) {
      if (attemptTimedByQuestions) durationMinutes = Math.max(1, Math.ceil(totalQuestionSeconds / 60));
      else if (form.isTimed) durationMinutes = Number(form.timeLimitMinutes) || null;
    } else if (form.startDateTime && form.endDateTime) {
      const minutes = Math.round((new Date(form.endDateTime) - new Date(form.startDateTime)) / 60000);
      durationMinutes = minutes > 0 ? minutes : null;
    }
    onTestRun?.({
      name: form.name.trim() || 'Untitled exam',
      program: programs.find((program) => String(program._id) === String(programId)) || null,
      description: form.description,
      instructions: form.instructions,
      durationMinutes,
      passingThreshold: Number(form.passingThreshold),
      questions: selectedQuestions,
      scoringMode: usesCustomPoints ? 'custom' : 'equal',
      defaultQuestionPoints: Number(form.defaultQuestionPoints),
      questionTimerEnabled: usesQuestionTimer,
      defaultQuestionSeconds: form.defaultQuestionSeconds,
      oneWayNavigation: usesOneWay,
      oneWayBackAllowed: Boolean(form.oneWayBackAllowed),
      itemSettings: questionSettings.map((setting) => ({
        question: setting.id,
        points: Number(setting.points),
        timeLimitSeconds: setting.seconds,
      })),
    });
  }
  const visibleTab = isFormReady ? activeTab : null;
  const wasPublished = loadedStatus === 'published';

  // In the window the form scrolls under its pinned tab bar. A new tab starts at its top,
  // with the tab bar where it was, rather than partway down.
  const formRef = useRef(null);
  useEffect(() => {
    const formEl = formRef.current;
    const heroEl = formEl?.querySelector('.mbe-hero-banner');
    if (!isModal || !formEl || !heroEl) return;
    // Where the tab bar sits unpinned: below the hero and the gap
    const tabBarTop = heroEl.offsetTop + heroEl.offsetHeight + (parseFloat(getComputedStyle(formEl).rowGap) || 0);
    if (formEl.scrollTop > tabBarTop) formEl.scrollTop = tabBarTop;
  }, [activeTab, isModal]);

  // After a save stops on a bad point or time, the first one is brought into view: a default,
  // or the question opened for it, whose card is shown in the list and its boxes in the panel
  useEffect(() => {
    if (!revealInvalidSettingRef.current || visibleTab !== 'questions' || questionView !== 'settings') return;
    revealInvalidSettingRef.current = false;
    revealActiveCard(settingsListRef.current);
    formRef.current
      ?.querySelector('.mbe-settings-grid .is-invalid, .mbe-panel-settings .is-invalid')
      ?.scrollIntoView({ block: 'center' });
  });

  // Escape closes a full-size image before anything else, including the window around the form
  useEffect(() => {
    if (!fullscreenImage) return undefined;
    const closeImageOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setFullscreenImage(null);
    };
    window.addEventListener('keydown', closeImageOnEscape, true);
    return () => window.removeEventListener('keydown', closeImageOnEscape, true);
  }, [fullscreenImage]);

  const imageOverlay = fullscreenImage ? (
    <div
      className={`mbe-image-overlay${isModal ? ' mbe-image-overlay--over-modal' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={() => setFullscreenImage(null)}
    >
      <div className="mbe-image-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="mbe-image-close"
          onClick={() => setFullscreenImage(null)}
        >
          Close
        </button>
        <AuthImage src={fullscreenImage} alt="Question preview" className="mbe-image-full" />
      </div>
    </div>
  ) : null;

  return (
    <>
      <form
        ref={formRef}
        className={`mbe-form${isModal ? ' mbe-form--modal' : ''}`}
        data-audience={isAlumniExam ? 'alumni' : 'student'}
        onSubmit={handleSubmit}
      >

        {/* ── What saving does, in the window ───────────────────────────────── */}
        {isModal && isFormReady && (
          <div className="qp-modal-copy mbe-modal-copy">
            <p className="qp-modal-subtitle">
              {wasPublished
                ? <><strong>{loadedName}</strong> is published. Saving your changes moves it back to Draft, so publish it again afterwards.</>
                : <>Update <strong>{loadedName}</strong>, then save your changes.</>}
            </p>
            {selectedProgram ? <span className="qp-modal-program-chip">{selectedProgram.code || selectedProgram.name}</span> : null}
          </div>
        )}

        {isLoadingExam && <p className="mbe-empty-message mbe-form-note">Loading the exam...</p>}
        {loadError && <p className="mbe-form-note mbe-form-note--error" role="alert">{loadError}</p>}

        {isFormReady && (
          <>
            {/* ── Audience Hero Banner ──────────────────────────────────────── */}
            <div className="mbe-hero-banner" data-audience={isAlumniExam ? 'alumni' : 'student'}>
              <div className="mbe-hero-left">
                <div className="mbe-hero-text">
                  <span className="mbe-hero-label">{audienceConfig.label}</span>
                  <span className="mbe-hero-sublabel">{audienceConfig.sublabel}</span>
                </div>
              </div>
              <div className="mbe-hero-right">
                <span className={`mbe-status-pill mbe-status-pill--${form.status}`}>
                  {getStatusLabel(form.status)}
                </span>
                {isEditing && (
                  <span className="mbe-hero-editing-badge">Editing</span>
                )}
              </div>
            </div>

            {/* ── Tab Bar ──────────────────────────────────────────────────── */}
            <div className="mbe-tab-bar" role="tablist" aria-label={isEditing ? 'Exam editing steps' : 'Exam creation steps'}>
              {[
                { key: 'details', label: 'Details', complete: detailsComplete, badge: null },
                { key: 'subjects', label: 'Subjects', complete: subjectsComplete, badge: selectedTagIds.length > 0 ? selectedTagIds.length : null },
                { key: 'questions', label: 'Questions', complete: questionsComplete, badge: selectedQuestions.length > 0 ? selectedQuestions.length : null },
                // The window saves from its own buttons, so its last tab only reviews
                { key: 'review', label: isModal ? 'Review' : 'Review & Save', complete: reviewComplete, badge: null },
              ].map(({ key, label, complete, badge }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === key}
                  className={`mbe-tab-btn ${activeTab === key ? 'is-active' : ''}`}
                  onClick={() => setActiveTab(key)}
                >
                  <FieldCheck valid={complete} validText="Complete" invalidText="Incomplete" />
                  {label}
                  {badge !== null && (
                    <span className={`mbe-tab-badge ${activeTab === key ? 'is-active' : ''}`}>{badge}</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: DETAILS
        ════════════════════════════════════════════════════════════════════ */}
        {visibleTab === 'details' && (
          <section className="mbe-card mbe-form-card" data-audience={isAlumniExam ? 'alumni' : 'student'}>

            {/* Audience toggle cards */}
            <fieldset className="mbe-audience-fieldset">
              <legend className="mbe-audience-legend">Who is this exam for?</legend>
              <div className="mbe-audience-cards">

                <label className={`mbe-audience-card mbe-audience-card--student ${!isAlumniExam ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="targetAudience"
                    value="student"
                    checked={!isAlumniExam}
                    onChange={() => setForm((prev) => ({ ...prev, targetAudience: 'student', isTimed: false }))}
                  />
                  <span className="mbe-audience-card-title">Students</span>
                  <span className="mbe-audience-card-desc">Scheduled exam for enrolled students with a fixed time window.</span>
                </label>

                <label className={`mbe-audience-card mbe-audience-card--alumni ${isAlumniExam ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="targetAudience"
                    value="alumni"
                    checked={isAlumniExam}
                    onChange={() => setForm((prev) => ({ ...prev, targetAudience: 'alumni' }))}
                  />
                  <span className="mbe-audience-card-title">Alumni</span>
                  <span className="mbe-audience-card-desc">Practice exam for alumni. Supports multiple attempts and optional timers.</span>
                </label>

              </div>
            </fieldset>

            <div className="mbe-form-grid">
              <div className="mbe-field">
                <label>
                  <span className="mbe-label-row">Exam Name <FieldCheck valid={fieldValid.name} /></span>
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
                  <span className="mbe-label-row">Program <FieldCheck valid={fieldValid.program} /></span>
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
                  <label>
                    <span className="mbe-label-row">
                      Exam Schedule <FieldCheck valid={fieldValid.start && fieldValid.end} />
                    </span>
                  </label>
                  <span className={`mbe-field-meta ${computedDuration?.includes('Invalid') ? 'is-error' : ''}`}>
                    {computedDuration ? `Duration: ${computedDuration}` : '\u00A0'}
                  </span>
                </div>
                {/* With question timers, only the start is picked: the exam ends when their time is up */}
                <DateTimePicker
                  range={!endFollowsQuestionTimes || totalQuestionSeconds > 0}
                  fixedDurationMs={endFollowsQuestionTimes ? Math.ceil(totalQuestionSeconds / 60) * 60000 : 0}
                  endNote="The end follows the start, from the question timers."
                  value={form.startDateTime}
                  endValue={form.endDateTime}
                  onChange={(start, end) => setForm((prev) => (
                    endFollowsQuestionTimes
                      ? { ...prev, startDateTime: start }
                      : { ...prev, startDateTime: start, endDateTime: end }
                  ))}
                  title="Exam Schedule"
                  description={endFollowsQuestionTimes
                    ? 'Pick when this exam starts. It ends when the time for all its questions is up. Exams already scheduled for this program are shown on the calendar.'
                    : 'Pick when this exam starts and ends. Exams already scheduled for this program are shown on the calendar.'}
                  placeholder={endFollowsQuestionTimes ? 'Select Start' : 'Select Start & End'}
                  role={me?.role}
                  programId={programId}
                  audience={form.targetAudience || 'student'}
                  excludeExamId={examId}
                />
                {endFollowsQuestionTimes && (
                  <p className="mbe-field-note">
                    {totalQuestionSeconds > 0
                      ? <>Ends automatically, {formatDurationFromSeconds(totalQuestionSeconds)} after the start: the time for all its questions.</>
                      : <>Ends automatically when the time for all its questions is up. Add questions to work out the end.</>}
                  </p>
                )}
              </div>

              <div className="mbe-field">
                <label>
                  <span className="mbe-label-row">Passing Threshold (%) <FieldCheck valid={fieldValid.passingThreshold} /></span>
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

              {isAlumniExam && (
                <div className="mbe-field mbe-field--full">
                  <div className="mbe-alumni-settings">
                    <div>
                      <h3>Alumni Attempt Timer</h3>
                      <p>This alumni exam becomes available when published and its schedule starts, and stays open until it ends, is archived or unpublished.</p>
                    </div>

                    {attemptTimedByQuestions ? (
                      <p className="mbe-availability-note">
                        Each attempt is timed by its question timers
                        {totalQuestionSeconds > 0 ? <>: <strong>{formatDurationFromSeconds(totalQuestionSeconds)}</strong> in all</> : null}.
                        {' '}Change the times in Questions, under Question Settings.
                      </p>
                    ) : (
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
                    )}

                    {attemptTimedByQuestions ? null : form.isTimed ? (
                      <label className="mbe-timer-field">
                        <span className="mbe-label-row">Time Limit (minutes) <FieldCheck valid={fieldValid.timeLimit} /></span>
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

              <div className="mbe-field mbe-field--full mbe-textarea-grid">
                <label>
                  <span className="mbe-label-row">Description <FieldCheck valid={fieldValid.description} /></span>
                  <textarea
                    className="mbe-input mbe-textarea"
                    rows="4"
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="General description of the exam..."
                  />
                </label>
                <label>
                  <span className="mbe-label-row">Instructions <FieldCheck valid={fieldValid.instructions} /></span>
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
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: SUBJECTS
        ════════════════════════════════════════════════════════════════════ */}
        {visibleTab === 'subjects' && (
          <section className="mbe-card mbe-selection-card" data-audience={isAlumniExam ? 'alumni' : 'student'}>
            <div className="mbe-section-heading">
              <div>
                <h2>Subjects</h2>
                <p>Choose the subject areas that will be included in this exam.</p>
              </div>
              <div className="mbe-section-badges">
                <span className="mbe-count-pill">{selectedTagIds.length} selected</span>
              </div>
            </div>

            {!programId ? <p className="mbe-empty-message">Select a program first (in the Details tab) before choosing subjects.</p> : null}
            {programId && loadingSubjects ? <p className="mbe-empty-message">Loading subjects...</p> : null}
            {programId && !loadingSubjects && subjectOptions.length === 0 ? <p className="mbe-empty-message">No subjects found for this program.</p> : null}
            {programId && !loadingSubjects && subjectOptions.length > 0 ? (() => {
              const filteredBySearch = subjectOptions.filter((tag) =>
                !subjectSearch.trim() || tag.name.toLowerCase().includes(subjectSearch.trim().toLowerCase())
              );
              const totalSubjectPages = Math.max(1, Math.ceil(filteredBySearch.length / SUBJECTS_PER_PAGE));
              const safeSubjectPage = Math.min(subjectPage, totalSubjectPages);
              const pagedSubjects = filteredBySearch.slice((safeSubjectPage - 1) * SUBJECTS_PER_PAGE, safeSubjectPage * SUBJECTS_PER_PAGE);
              return (
                <>
                  <div className="mbe-subject-search-row">
                    <SearchBar
                      className="mbe-subject-search"
                      placeholder="Search subjects..."
                      value={subjectSearch}
                      onChange={(value) => { setSubjectSearch(value); setSubjectPage(1); }}
                    />
                  </div>
                  {filteredBySearch.length === 0 ? (
                    <p className="mbe-empty-message">No subjects match your search.</p>
                  ) : (
                    <div className="mbe-tag-grid">
                      {pagedSubjects.map((tag) => (
                        <label key={tag._id} className={`mbe-tag-option ${selectedTagIds.includes(String(tag._id)) ? 'is-selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selectedTagIds.includes(String(tag._id))}
                            onChange={() => handleTagChange(String(tag._id))}
                          />
                          <span>{tag.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <Pagination
                    currentPage={safeSubjectPage}
                    totalItems={filteredBySearch.length}
                    pageSize={SUBJECTS_PER_PAGE}
                    onPageChange={setSubjectPage}
                    itemLabel="subjects"
                    classPrefix="el"
                  />
                </>
              );
            })() : null}


          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: QUESTIONS
        ════════════════════════════════════════════════════════════════════ */}
        {visibleTab === 'questions' && (
          <div className="mbe-question-views ca-embedded">
            {/* Approved Questions picks the questions; Question Settings sets their points and times */}
            <div className="mbe-question-view-bar">
              <div className="ca-view-toggle mbe-view-toggle" role="group" aria-label="Show in the Questions tab">
                <button
                  type="button"
                  className={questionView === 'approved' ? 'is-active' : ''}
                  aria-pressed={questionView === 'approved'}
                  onClick={() => setQuestionView('approved')}
                >
                  Approved Questions
                </button>
                <button
                  type="button"
                  className={questionView === 'settings' ? 'is-active' : ''}
                  aria-pressed={questionView === 'settings'}
                  onClick={() => setQuestionView('settings')}
                >
                  Question Settings
                  {!questionSettingsValid && (
                    <span className="mbe-view-toggle-flag" role="img" aria-label="needs fixing">!</span>
                  )}
                </button>
              </div>
              {/* The exam's totals, each with the icon used for it elsewhere: the question list's,
                  and the Points and Question Timer sections' */}
              <ul className="mbe-question-stats" aria-label="This exam's totals">
                <li className="mbe-question-stat">
                  <span className="mbe-question-stat-icon">{QUESTIONS_ICON}</span>
                  <strong>{selectedQuestions.length}</strong>
                  <span>question{selectedQuestions.length === 1 ? '' : 's'}</span>
                </li>
                <li className="mbe-question-stat">
                  <span className="mbe-question-stat-icon">{POINTS_RULE_ICON}</span>
                  <strong>{totalPoints}</strong>
                  <span>point{totalPoints === 1 ? '' : 's'}</span>
                </li>
                {usesQuestionTimer && totalQuestionSeconds > 0 ? (
                  <li className="mbe-question-stat">
                    <span className="mbe-question-stat-icon">{TIMER_RULE_ICON}</span>
                    <strong>{formatDurationFromSeconds(totalQuestionSeconds)}</strong>
                  </li>
                ) : null}
              </ul>
            </div>

            {questionView === 'approved' && (
              <>
                {/* Filters above the list, as on the other list pages */}
                {programId && selectedTagIds.length > 0 && (
                  <div className="mbe-question-toolbar">
                    <CapsuleFilters
                      ariaLabel="Filter questions by type"
                      options={[
                        { value: 'all', label: 'All', count: questionTypeCounts.all },
                        { value: 'single', label: 'Single', count: questionTypeCounts.single },
                        { value: 'group', label: 'Group', count: questionTypeCounts.group },
                      ]}
                      value={questionTypeFilter}
                      onChange={(value) => {
                        setQuestionTypeFilter(value);
                        setQuestionPage(1);
                      }}
                    />
                    <div className="mbe-question-filters">
                      <SearchBar
                        className="mbe-search"
                        placeholder="Search approved question"
                        value={searchQuery}
                        onChange={(value) => {
                          setSearchQuery(value);
                          setQuestionPage(1);
                        }}
                      />
                      <DropdownSelect
                        className="mbe-filter-select"
                        value={questionFilterTagId}
                        onChange={(e) => {
                          setQuestionFilterTagId(e.target.value);
                          setQuestionPage(1);
                        }}
                        ariaLabel="Filter questions by subject"
                        placeholder="All selected subjects"
                        options={filteredSubjectOptions.map((tag) => ({ value: tag._id, label: tag.name }))}
                      />
                      <DropdownSelect
                        className="mbe-filter-select"
                        value={approvedSelectionFilter}
                        onChange={(e) => {
                          setApprovedSelectionFilter(e.target.value);
                          setQuestionPage(1);
                        }}
                        ariaLabel="Filter questions by whether they are in this exam"
                        options={[
                          { value: 'all', label: 'All questions' },
                          { value: 'selected', label: 'In this exam' },
                          { value: 'unselected', label: 'Not in this exam' },
                        ]}
                      />
                    </div>
                  </div>
                )}

                {/* The approved questions on one side, the open one previewed on the other */}
                <div
                  className={`${approvedPanel.layoutClass(Boolean(approvedOpenItem))} mbe-workspace`}
                  onTransitionEnd={approvedPanel.onLayoutTransitionEnd}
                >
                  <section className="ca-list-panel" aria-label="Approved questions">
                    <MarkerLegend items={APPROVED_LEGEND} ariaLabel="What the question markers mean" />

                    {bulkSelectedIds.size > 0 && (
                      <div className="ca-bulk-toolbar">
                        <span className="ca-bulk-count">
                          {bulkSelectedIds.size} question{bulkSelectedIds.size > 1 ? 's' : ''} selected
                        </span>
                        <div className="ca-bulk-actions">
                          {approvedQuestions.some((question) => (
                            bulkSelectedIds.has(question._id) && !selectedQuestionIds.has(String(question._id))
                          )) && (
                            <button className="ca-bulk-btn ca-bulk-btn--approve" type="button" onClick={handleBulkAddSelected}>
                              Add to Exam
                            </button>
                          )}
                          {approvedQuestions.some((question) => (
                            bulkSelectedIds.has(question._id) && selectedQuestionIds.has(String(question._id))
                          )) && (
                            <button className="ca-bulk-btn ca-bulk-btn--remove" type="button" onClick={handleBulkRemoveSelected}>
                              Remove from Exam
                            </button>
                          )}
                          <button className="ca-bulk-btn ca-bulk-btn--clear" type="button" onClick={() => setBulkSelectedIds(new Set())}>
                            ✕ Clear
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="ca-list-scroll" ref={approvedListRef}>
                      {!programId ? (
                        <div className="ca-empty">Select a program first.</div>
                      ) : selectedTagIds.length === 0 ? (
                        <div className="ca-empty">Select at least one subject to show approved questions.</div>
                      ) : loadingQuestions ? (
                        <div className="ca-empty">Loading approved questions...</div>
                      ) : approvedCards.length === 0 ? (
                        <div className="ca-empty">No approved questions match the current filters.</div>
                      ) : (() => {
                        const totalQPages = Math.max(1, Math.ceil(approvedCards.length / QUESTIONS_PER_PAGE));
                        const safeQPage = Math.min(questionPage, totalQPages);
                        const pagedCards = approvedCards.slice((safeQPage - 1) * QUESTIONS_PER_PAGE, safeQPage * QUESTIONS_PER_PAGE);
                        const allMatchingChecked = filteredApprovedQuestions.every((question) => bulkSelectedIds.has(question._id));
                        const someMatchingChecked = filteredApprovedQuestions.some((question) => bulkSelectedIds.has(question._id));

                        return (
                          <>
                            {/* Every question the filters match, across the pages */}
                            <div className="ca-select-all-row">
                              <label className="ca-select-all-label">
                                <input
                                  type="checkbox"
                                  className="ca-checkbox"
                                  checked={allMatchingChecked}
                                  ref={(element) => { if (element) element.indeterminate = someMatchingChecked && !allMatchingChecked; }}
                                  onChange={handleToggleAllFiltered}
                                />
                                <span>Select all {filteredApprovedQuestions.length} matching</span>
                              </label>
                              {approvedSelectionFilter === 'selected' ? (
                                <button
                                  type="button"
                                  className="mbe-btn mbe-btn-ghost mbe-btn-small mbe-filter-action mbe-filter-action--danger"
                                  onClick={() => setFilteredBulkModal('remove')}
                                >
                                  Remove all matching
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="mbe-btn mbe-btn-ghost mbe-btn-small mbe-filter-action"
                                  onClick={() => setFilteredBulkModal('add')}
                                >
                                  Add all matching
                                </button>
                              )}
                            </div>

                            {/* Keyed so the cards come in again for each new view, but not while typing a search */}
                            <div
                              className="ca-questions-list"
                              key={[questionTypeFilter, questionFilterTagId, approvedSelectionFilter, safeQPage].join('|')}
                            >
                              {pagedCards.map((card, cardIndex) => {
                                const { question, members, isSet } = card;
                                const checkedCount = members.filter((member) => bulkSelectedIds.has(member._id)).length;
                                const isChecked = checkedCount > 0 && checkedCount === members.length;
                                const isInExam = members.some((member) => selectedQuestionIds.has(String(member._id)));
                                // Questions in this exam are marked as such instead
                                const isUsedElsewhere = !isInExam && members.some((member) => member.is_used_in_exam);
                                const noun = isSet ? 'question set' : 'question';

                                return (
                                  <Fragment key={card.key}>
                                  <div
                                    className={[
                                      isSet ? 'ca-group-header-card' : 'ca-question-card',
                                      'mbe-pick-card',
                                      approvedOpenItem?.key === card.key ? 'is-active' : '',
                                      isChecked ? 'is-checked' : '',
                                    ].filter(Boolean).join(' ')}
                                    style={{ '--card-index': cardIndex }}
                                    onClick={() => setApprovedOpenKey(card.key)}
                                  >
                                    <div className="ca-card-top">
                                      <div className="ca-card-checkbox-wrap" onClick={(e) => handleBulkCheckbox(e, question)}>
                                        <input
                                          type="checkbox"
                                          className="ca-checkbox"
                                          aria-label={`Select this ${noun}`}
                                          checked={isChecked}
                                          ref={(element) => { if (element) element.indeterminate = checkedCount > 0 && !isChecked; }}
                                          onChange={() => { }}
                                        />
                                      </div>
                                      {/* Its click bubbles up to the card, so keyboard users can open the card too */}
                                      <button type="button" className="ca-card-open" aria-label={`Preview this ${noun}`}>
                                        <span className={`ca-card-desc${isSet ? ' ca-card-desc--set' : ''}`}>
                                          {isSet
                                            ? (question.groupContext?.trim() ? <SafeHtml html={truncateHtml(question.groupContext.trim(), 80)} /> : 'Question Set')
                                            : <SafeHtml html={truncateHtml(question.description, 100)} />}
                                        </span>
                                      </button>
                                      <div className="ca-card-markers">
                                        {isSet && (
                                          <Marker className="ca-marker--count" label={`${members.length} questions`}>{members.length}</Marker>
                                        )}
                                        {isUsedElsewhere && (
                                          <Marker className="ca-marker--used" label="Used in an exam">{USED_IN_EXAM_ICON}</Marker>
                                        )}
                                        {isInExam && (
                                          <Marker className="mbe-marker--in-exam" label="In this exam">{IN_EXAM_ICON}</Marker>
                                        )}
                                      </div>
                                    </div>
                                    <div className="ca-card-meta">
                                      <span className="ca-tag-pill">{question.tag?.name || 'No subject'}</span>
                                      <span className="ca-author">{question.createdBy?.name || 'Unknown'}</span>
                                      {!isSet && (
                                        <span className="mbe-card-counts">
                                          {question.answers?.length || 0} answers · {question.images?.length || 0} images
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {isSet && (
                                    <SetMemberRows
                                      members={members}
                                      open={approvedOpenItem?.key === card.key}
                                      activeIndex={Math.min(activeGroupIdx[question.groupId] || 0, members.length - 1)}
                                      cardIndex={cardIndex}
                                      onOpenMember={(index) => {
                                        setApprovedOpenKey(card.key);
                                        setActiveGroupIdx((prev) => ({ ...prev, [question.groupId]: index }));
                                      }}
                                    />
                                  )}
                                  </Fragment>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {programId && selectedTagIds.length > 0 && !loadingQuestions && (
                      <Pagination
                        currentPage={questionPage}
                        totalItems={approvedCards.length}
                        pageSize={QUESTIONS_PER_PAGE}
                        onPageChange={setQuestionPage}
                        itemLabel={approvedCards.length === filteredApprovedQuestions.length ? 'questions' : 'questions and sets'}
                        classPrefix="ca"
                        maxPageButtons={5}
                      />
                    )}
                  </section>

                  {approvedOpenItem ? (() => {
                    const { members, isSet } = approvedOpenItem;
                    const groupId = approvedOpenItem.question.groupId;
                    const shownIndex = isSet ? Math.min(activeGroupIdx[groupId] || 0, members.length - 1) : 0;
                    const shownQuestion = members[shownIndex] || approvedOpenItem.question;
                    const isInExam = members.some((member) => selectedQuestionIds.has(String(member._id)));
                    const examNumbers = members
                      .map((member) => examNumberById.get(String(member._id)))
                      .filter(Boolean)
                      .sort((a, b) => a - b);
                    const inExamLabel = examNumbers.length === 0
                      ? 'Not added'
                      : examNumbers.length === 1
                        ? `Question ${examNumbers[0]}`
                        : `Questions ${examNumbers[0]}–${examNumbers[examNumbers.length - 1]}`;

                    return (
                      <div className={approvedPanel.sidebarClass}>
                        <PanelHeader
                          title={isSet ? `Question Set (${members.length} Questions)` : 'Question'}
                          isExpanded={approvedPanel.isExpanded}
                          onToggleExpanded={approvedPanel.toggleExpanded}
                          onClose={() => setApprovedOpenKey(null)}
                          closeLabel="Close the question preview"
                        >
                          {approvedNavIndex >= 0 && approvedCards.length > 1 && (
                            <PanelStepper index={approvedNavIndex} total={approvedCards.length} onStep={openApprovedCard} />
                          )}
                        </PanelHeader>

                        {/* Keyed so each question starts scrolled to the top */}
                        <div className="ca-sidebar-content" key={approvedOpenItem.key}>
                          {isSet && members.length > 1 && (
                            <ImportReviewBubbles
                              questions={members}
                              currentIdx={shownIndex}
                              onSelectQuestion={(idx) => setActiveGroupIdx((prev) => ({ ...prev, [groupId]: idx }))}
                              readOnly
                              allInOneSet
                            />
                          )}

                          <QuestionDetailPanels
                            key={shownQuestion._id}
                            question={shownQuestion}
                            passage={isSet ? (shownQuestion.groupContext || approvedOpenItem.question.groupContext || '').trim() : ''}
                            passageImages={isSet ? (shownQuestion.groupContextImages || approvedOpenItem.question.groupContextImages || []) : []}
                            onZoom={setFullscreenImage}
                          />

                          <section className="ca-section ca-review-metadata" key={`details-${shownQuestion._id}`}>
                            <div className="ca-meta-grid">
                              <div>
                                <span className="ca-meta-label">Subject</span>
                                <div className="ca-meta-value">{shownQuestion.tag?.name || 'No subject'}</div>
                              </div>
                              <div>
                                <span className="ca-meta-label">Professor</span>
                                <div className="ca-meta-value">{shownQuestion.createdBy?.name || 'Unknown'}</div>
                              </div>
                              <div>
                                <span className="ca-meta-label">In This Exam</span>
                                <div className="ca-meta-value">{inExamLabel}</div>
                              </div>
                              <div>
                                <span className="ca-meta-label">Used in an Exam</span>
                                <div className="ca-meta-value">{members.some((member) => member.is_used_in_exam) ? 'Yes' : 'No'}</div>
                              </div>
                            </div>
                          </section>
                        </div>

                        <div className="ca-sidebar-actions">
                          {!shownQuestion.is_used_in_exam && (
                            <button
                              type="button"
                              className="ca-btn ca-btn--return"
                              onClick={() => handleReturnQuestion(shownQuestion)}
                            >
                              Return to Creator
                            </button>
                          )}
                          <button
                            type="button"
                            className={`ca-btn ${isInExam ? 'ca-btn--reject' : 'ca-btn--approve'}`}
                            onClick={() => (isInExam ? removeFromExam(approvedOpenItem.question) : handleQuestionToggle(approvedOpenItem.question))}
                          >
                            {isInExam
                              ? (isSet ? 'Remove Set from Exam' : 'Remove from Exam')
                              : (isSet ? 'Add Set to Exam' : 'Add to Exam')}
                          </button>
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="ca-sidebar ca-sidebar--empty">
                      <p>Select a question to preview it</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {questionView === 'settings' && (
              <>
                {/* The exam's points and timer: each a section with an icon, a plain title and its
                    own switch, so both are easy to find and say at a glance whether they are on */}
                <section className="mbe-card mbe-form-card" data-audience={isAlumniExam ? 'alumni' : 'student'}>
                  <div className="mbe-section-heading">
                    <div>
                      <h2>Question Settings</h2>
                      <p>Set how many points each question is worth, how long students get to answer it, and whether they can go back.</p>
                    </div>
                  </div>

                  <div className="mbe-settings-grid">
                    <section className={`mbe-rule${usesCustomPoints ? ' is-on' : ''}`} aria-labelledby="mbe-settings-points-title">
                      <div className="mbe-rule-head">
                        <span className="mbe-rule-icon" aria-hidden="true">{POINTS_RULE_ICON}</span>
                        <div className="mbe-rule-heading">
                          <h3 id="mbe-settings-points-title" className="mbe-rule-title">Points</h3>
                          <p className="mbe-rule-desc">How much each question is worth</p>
                        </div>
                        <RuleSwitch
                          checked={usesCustomPoints}
                          onChange={(checked) => setForm((prev) => ({ ...prev, scoringMode: checked ? 'custom' : 'equal' }))}
                          label="Give questions custom points"
                        />
                      </div>
                      <div className="mbe-rule-body">
                        {usesCustomPoints ? (
                          <>
                            <div className="mbe-rule-value">
                              <label className="mbe-settings-field">
                                <span className="mbe-label-row">
                                  Points per question <FieldCheck valid={isValidQuestionPoints(form.defaultQuestionPoints)} />
                                </span>
                                <input
                                  className={`mbe-input mbe-points-input${isValidQuestionPoints(form.defaultQuestionPoints) ? '' : ' is-invalid'}`}
                                  type="number"
                                  min={QUESTION_POINTS_MIN}
                                  max={QUESTION_POINTS_MAX}
                                  step="1"
                                  inputMode="numeric"
                                  value={form.defaultQuestionPoints}
                                  onChange={(e) => setForm((prev) => ({ ...prev, defaultQuestionPoints: readNumberInput(e.target.value) }))}
                                  aria-invalid={!isValidQuestionPoints(form.defaultQuestionPoints)}
                                />
                              </label>
                              <div className="mbe-rule-total">
                                <strong>{totalPoints} point{totalPoints === 1 ? '' : 's'}</strong>
                                <span>in all</span>
                              </div>
                            </div>
                            <p className="mbe-settings-meta">
                              Applies to every question. Whole numbers from {QUESTION_POINTS_MIN} to {QUESTION_POINTS_MAX}.
                            </p>
                            {ownPointsCount > 0 && (
                              <div className="mbe-settings-own">
                                <span>
                                  {ownPointsCount} question{ownPointsCount === 1 ? ' has its' : 's have their'} own points.
                                </span>
                                <button
                                  type="button"
                                  className="mbe-btn mbe-btn-ghost mbe-btn-small"
                                  onClick={() => setApplyAllSetting('points')}
                                  disabled={!isValidQuestionPoints(form.defaultQuestionPoints)}
                                >
                                  Apply to all
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="mbe-rule-off">Off: every question is worth 1 point.</p>
                        )}
                      </div>
                    </section>

                    <section className={`mbe-rule${usesQuestionTimer ? ' is-on' : ''}`} aria-labelledby="mbe-settings-timer-title">
                      <div className="mbe-rule-head">
                        <span className="mbe-rule-icon" aria-hidden="true">{TIMER_RULE_ICON}</span>
                        <div className="mbe-rule-heading">
                          <h3 id="mbe-settings-timer-title" className="mbe-rule-title">Question Timer</h3>
                          <p className="mbe-rule-desc">How long students get for each question</p>
                        </div>
                        <RuleSwitch
                          checked={usesQuestionTimer}
                          onChange={(checked) => setForm((prev) => ({ ...prev, questionTimerEnabled: checked }))}
                          label="Time each question"
                        />
                      </div>
                      <div className="mbe-rule-body">
                        {usesQuestionTimer ? (
                          <>
                            <div className="mbe-rule-value">
                              <div className="mbe-settings-field">
                                <span className="mbe-label-row">
                                  Time per question <FieldCheck valid={isValidQuestionSeconds(form.defaultQuestionSeconds)} />
                                </span>
                                <QuestionTimeInput
                                  value={form.defaultQuestionSeconds}
                                  onChange={(seconds) => setForm((prev) => ({ ...prev, defaultQuestionSeconds: seconds }))}
                                  label="Time per question"
                                  invalid={!isValidQuestionSeconds(form.defaultQuestionSeconds)}
                                />
                              </div>
                              {totalQuestionSeconds > 0 && (
                                <div className="mbe-rule-total">
                                  <strong>{formatDurationFromSeconds(totalQuestionSeconds)}</strong>
                                  <span>in all</span>
                                </div>
                              )}
                            </div>
                            <p className="mbe-settings-meta">
                              Applies to every question. From 10 seconds to 60 minutes.
                              {' '}
                              {isAlumniExam
                                ? 'Each alumni attempt is limited to the total.'
                                : 'The exam ends automatically when the total is up after it starts.'}
                            </p>
                            {ownSecondsCount > 0 && (
                              <div className="mbe-settings-own">
                                <span>
                                  {ownSecondsCount} question{ownSecondsCount === 1 ? ' has its' : 's have their'} own time.
                                </span>
                                <button
                                  type="button"
                                  className="mbe-btn mbe-btn-ghost mbe-btn-small"
                                  onClick={() => setApplyAllSetting('seconds')}
                                  disabled={!isValidQuestionSeconds(form.defaultQuestionSeconds)}
                                >
                                  Apply to all
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="mbe-rule-off">Off: questions have no time limit of their own.</p>
                        )}
                      </div>
                    </section>

                    <section className={`mbe-rule mbe-rule--wide${usesOneWay ? ' is-on' : ''}`} aria-labelledby="mbe-settings-one-way-title">
                      <div className="mbe-rule-head">
                        <span className="mbe-rule-icon" aria-hidden="true">{ONE_WAY_RULE_ICON}</span>
                        <div className="mbe-rule-heading">
                          <h3 id="mbe-settings-one-way-title" className="mbe-rule-title">One-Way Navigation</h3>
                          <p className="mbe-rule-desc">Whether {isAlumniExam ? 'alumni' : 'students'} can move between questions</p>
                        </div>
                        <RuleSwitch
                          checked={usesOneWay}
                          onChange={(checked) => setForm((prev) => ({ ...prev, oneWayNavigation: checked }))}
                          label="One question at a time, with no going back"
                        />
                      </div>
                      <div className="mbe-rule-body">
                        {usesOneWay ? (
                          <>
                            <p className="mbe-settings-meta">
                              Questions come one at a time, in order. {isAlumniExam ? 'An alumnus' : 'A student'} must
                              answer the open question to get the next one, can't skip ahead, and
                              {form.oneWayBackAllowed ? " can't change an answer once it is submitted." : " can't go back to a question once it is submitted."}
                              {usesQuestionTimer ? ' A question whose time runs out is submitted with the answer picked.' : ''}
                            </p>
                            <label className="mbe-rule-check">
                              <input
                                type="checkbox"
                                checked={Boolean(form.oneWayBackAllowed)}
                                onChange={(e) => setForm((prev) => ({ ...prev, oneWayBackAllowed: e.target.checked }))}
                              />
                              <span>
                                <strong>Allow going back</strong>
                                <span>Questions already answered can be reopened to look at, but not changed. The ones not reached yet stay locked.</span>
                              </span>
                            </label>
                          </>
                        ) : (
                          <p className="mbe-rule-off">Off: questions can be answered in any order and changed until the exam is submitted.</p>
                        )}
                      </div>
                    </section>
                  </div>
                </section>

                {/* The same filters as Approved Questions', for the exam's own questions */}
                {selectedQuestions.length > 0 && (
                  <div className="mbe-question-toolbar">
                    <CapsuleFilters
                      ariaLabel="Filter the exam's questions by type"
                      options={[
                        { value: 'all', label: 'All', count: settingsTypeCounts.all },
                        { value: 'single', label: 'Single', count: settingsTypeCounts.single },
                        { value: 'group', label: 'Group', count: settingsTypeCounts.group },
                      ]}
                      value={settingsTypeFilter}
                      onChange={(value) => {
                        setSettingsTypeFilter(value);
                        setSettingsPage(1);
                      }}
                    />
                    <div className="mbe-question-filters">
                      <SearchBar
                        className="mbe-search"
                        placeholder="Search this exam's questions"
                        value={settingsSearch}
                        onChange={(value) => {
                          setSettingsSearch(value);
                          setSettingsPage(1);
                        }}
                      />
                      <DropdownSelect
                        className="mbe-filter-select"
                        value={settingsSubjectFilterId}
                        onChange={(e) => {
                          setSettingsSubjectFilterId(e.target.value);
                          setSettingsPage(1);
                        }}
                        ariaLabel="Filter the exam's questions by subject"
                        placeholder="All selected subjects"
                        options={filteredSubjectOptions.map((tag) => ({ value: tag._id, label: tag.name }))}
                      />
                      <DropdownSelect
                        className="mbe-filter-select"
                        value={settingsStateFilter}
                        onChange={(e) => {
                          setSettingsStateFilter(e.target.value);
                          setSettingsPage(1);
                        }}
                        ariaLabel="Filter the exam's questions by their points and time"
                        options={[
                          { value: 'all', label: 'All questions' },
                          { value: 'own', label: 'Own points or time' },
                          { value: 'same', label: 'Same as the exam' },
                          { value: 'problem', label: 'Needs fixing' },
                        ]}
                      />
                    </div>
                  </div>
                )}

                {/* The exam's questions in order on one side; the open one's points, time and preview on the other */}
                <div
                  className={`${settingsPanel.layoutClass(Boolean(settingsOpenQuestion))} mbe-workspace`}
                  onTransitionEnd={settingsPanel.onLayoutTransitionEnd}
                >
                  <section className="ca-list-panel" aria-label="The exam's questions">
                    <MarkerLegend items={SETTINGS_LEGEND} ariaLabel="What the question markers mean" />

                    <div className="ca-list-scroll" ref={settingsListRef}>
                      {selectedQuestions.length === 0 ? (
                        <div className="ca-empty">No questions yet. Add them in Approved Questions first.</div>
                      ) : settingRows.length === 0 ? (
                        <div className="ca-empty">No questions match the current filters.</div>
                      ) : (() => {
                        const totalSettingsPages = Math.max(1, Math.ceil(settingCards.length / SETTINGS_PER_PAGE));
                        const safeSettingsPage = Math.min(settingsPage, totalSettingsPages);
                        const pagedSettingCards = settingCards.slice(
                          (safeSettingsPage - 1) * SETTINGS_PER_PAGE,
                          safeSettingsPage * SETTINGS_PER_PAGE
                        );
                        // A question's points and time, and whether either is its own or needs fixing
                        const stateOf = (question) => {
                          const setting = settingsByQuestionId.get(String(question._id));
                          if (!setting) return null;
                          const pointsProblem = usesCustomPoints && !setting.pointsValid;
                          const timeProblem = usesQuestionTimer && !setting.secondsValid;
                          return {
                            setting,
                            pointsProblem,
                            timeProblem,
                            hasProblem: pointsProblem || timeProblem,
                            hasOwnValue: (usesCustomPoints && setting.hasOwnPoints) || (usesQuestionTimer && setting.hasOwnSeconds),
                          };
                        };
                        // Its points and time as chips: its own outlined, a bad one red
                        const settingChips = ({ setting, pointsProblem, timeProblem }) => (usesCustomPoints || usesQuestionTimer) && (
                          <span className="mbe-setting-chips">
                            {usesCustomPoints && (
                              <span
                                className={`mbe-setting-chip${setting.hasOwnPoints ? ' is-own' : ''}${pointsProblem ? ' is-invalid' : ''}`}
                                title="Points"
                              >
                                {POINTS_RULE_ICON}
                                {setting.points === '' ? 'No points' : `${setting.points} point${Number(setting.points) === 1 ? '' : 's'}`}
                              </span>
                            )}
                            {usesQuestionTimer && (
                              <span
                                className={`mbe-setting-chip${setting.hasOwnSeconds ? ' is-own' : ''}${timeProblem ? ' is-invalid' : ''}`}
                                title="Time"
                              >
                                {TIMER_RULE_ICON}
                                {Number.isInteger(setting.seconds) ? formatShortDuration(setting.seconds) : 'No time'}
                              </span>
                            )}
                          </span>
                        );

                        return (
                          <div className="ca-questions-list" key={[settingsTypeFilter, settingsSubjectFilterId, settingsStateFilter, safeSettingsPage].join('|')}>
                            {pagedSettingCards.map((card, cardIndex) => {
                              const { members, isSet } = card;
                              const question = members[0];
                              const states = members.map(stateOf);
                              if (states.some((state) => !state)) return null;
                              const numbers = members.map((member) => examNumberById.get(String(member._id)));
                              const openIndex = members.findIndex((member) => String(member._id) === settingsOpenId);
                              const isOpen = openIndex >= 0;
                              const hasProblem = states.some((state) => state.hasProblem);
                              const hasOwnValue = states.some((state) => state.hasOwnValue);
                              const label = isSet
                                ? `Questions ${Math.min(...numbers)} to ${Math.max(...numbers)}`
                                : `Question ${numbers[0]}`;

                              return (
                                <Fragment key={card.key}>
                                  <div
                                    className={[
                                      isSet ? 'ca-group-header-card' : 'ca-question-card',
                                      'mbe-setting-card',
                                      isOpen ? 'is-active' : '',
                                      hasProblem ? 'has-problem' : '',
                                    ].filter(Boolean).join(' ')}
                                    style={{ '--card-index': cardIndex }}
                                    // A set opens at its first question, or stays on the one open
                                    onClick={() => { if (!isOpen) setSettingsOpenId(String(question._id)); }}
                                  >
                                    <div className="ca-card-top">
                                      <span className="mbe-card-number">
                                        {isSet ? `${Math.min(...numbers)}–${Math.max(...numbers)}` : numbers[0]}
                                      </span>
                                      {/* Its click bubbles up to the card, so keyboard users can open the card too */}
                                      <button type="button" className="ca-card-open" aria-label={`Open ${label.toLowerCase()}`}>
                                        <span className={`ca-card-desc${isSet ? ' ca-card-desc--set' : ''}`}>
                                          {isSet
                                            ? (question.groupContext?.trim() ? <SafeHtml html={truncateHtml(question.groupContext.trim(), 80)} /> : 'Question Set')
                                            : <SafeHtml html={truncateHtml(question.description, 100)} />}
                                        </span>
                                      </button>
                                      <div className="ca-card-markers">
                                        {isSet && (
                                          <Marker className="ca-marker--count" label={`${members.length} questions`}>{members.length}</Marker>
                                        )}
                                        {hasOwnValue && (
                                          <Marker className="mbe-marker--own" label="Own points or time">{OWN_VALUE_ICON}</Marker>
                                        )}
                                        {hasProblem && (
                                          <Marker className="mbe-marker--problem" label="Needs fixing">!</Marker>
                                        )}
                                      </div>
                                    </div>
                                    <div className="ca-card-meta">
                                      <span className="ca-tag-pill">{question.tag?.name || 'No subject'}</span>
                                      {/* A set's points and time are on its rows */}
                                      {!isSet && settingChips(states[0])}
                                    </div>
                                  </div>
                                  {isSet && (
                                    <SetMemberRows
                                      members={members}
                                      open={isOpen}
                                      activeIndex={openIndex}
                                      cardIndex={cardIndex}
                                      numberOf={(member, index) => numbers[index]}
                                      renderAside={(member, index) => settingChips(states[index])}
                                      rowClassName={(member, index) => (states[index].hasProblem ? 'has-problem' : '')}
                                      onOpenMember={(index) => setSettingsOpenId(String(members[index]._id))}
                                    />
                                  )}
                                </Fragment>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>

                    <Pagination
                      currentPage={settingsPage}
                      totalItems={settingCards.length}
                      pageSize={SETTINGS_PER_PAGE}
                      onPageChange={setSettingsPage}
                      itemLabel={settingCards.length === settingSteps.length ? 'questions' : 'questions and sets'}
                      classPrefix="ca"
                      maxPageButtons={5}
                    />
                  </section>

                  {settingsOpenQuestion ? (() => {
                    const question = organizeQuestionAnswers(settingsOpenQuestion);
                    const setting = settingsByQuestionId.get(settingsOpenId);
                    const number = settingsOpenIndex + 1;
                    // A set's questions in this exam, in set order, for the bubbles above the preview
                    const setMembers = question.groupId
                      ? selectedQuestions
                        .filter((item) => item.groupId === question.groupId)
                        .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0))
                      : [];
                    const setIndex = setMembers.findIndex((item) => String(item._id) === settingsOpenId);

                    return (
                      <div className={settingsPanel.sidebarClass}>
                        {/* The question's points and time sit in the header beside the arrows, so they
                            stay in view while its preview scrolls */}
                        <PanelHeader
                          title={`Question ${number}`}
                          isExpanded={settingsPanel.isExpanded}
                          onToggleExpanded={settingsPanel.toggleExpanded}
                          onClose={() => setSettingsOpenId(null)}
                          closeLabel="Close the question"
                        >
                          <QuestionSettingFields
                            number={number}
                            setting={setting}
                            usesCustomPoints={usesCustomPoints}
                            usesQuestionTimer={usesQuestionTimer}
                            defaultPoints={form.defaultQuestionPoints}
                            defaultSeconds={form.defaultQuestionSeconds}
                            onSetOwnValue={(key, value) => setQuestionOwnValue(setting.id, key, value)}
                          />
                          {settingsNavIndex >= 0 && settingSteps.length > 1 && (
                            <PanelStepper index={settingsNavIndex} total={settingSteps.length} onStep={openSettingStep} />
                          )}
                        </PanelHeader>

                        {/* Keyed so each question starts scrolled to the top */}
                        <div className="ca-sidebar-content" key={setting.id}>
                          {/* As in Approved Questions, a set's bubbles step through its questions;
                              each opens that question here, with its own points and time above */}
                          {setMembers.length > 1 && setIndex >= 0 && (
                            <ImportReviewBubbles
                              questions={setMembers}
                              currentIdx={setIndex}
                              onSelectQuestion={(idx) => {
                                const member = setMembers[idx];
                                if (member) openSettingQuestion(String(member._id));
                              }}
                              readOnly
                              allInOneSet
                            />
                          )}

                          <QuestionDetailPanels
                            key={`preview-${setting.id}`}
                            question={question}
                            passage={question.groupId ? (question.groupContext || '').trim() : ''}
                            passageImages={question.groupId ? (question.groupContextImages || []) : []}
                            onZoom={setFullscreenImage}
                          />
                        </div>

                        <div className="ca-sidebar-actions">
                          <button
                            type="button"
                            className="ca-btn ca-btn--reject"
                            onClick={() => {
                              removeFromExam(settingsOpenQuestion);
                              setSettingsOpenId(null);
                            }}
                          >
                            {question.groupId ? 'Remove Set from Exam' : 'Remove from Exam'}
                          </button>
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="ca-sidebar ca-sidebar--empty">
                      <p>Select a question to set its points and time</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: REVIEW & SAVE
        ════════════════════════════════════════════════════════════════════ */}
        {visibleTab === 'review' && (
          <section className="mbe-card mbe-form-card" data-audience={isAlumniExam ? 'alumni' : 'student'}>
            <div className="mbe-section-heading">
              <div>
                <h2>Review & Save</h2>
                <p>Review your exam details before saving.</p>
              </div>
            </div>

            <div className="mbe-review-grid">

              {/* Audience */}
              <div className="mbe-review-block">
                <p className="mbe-review-label">Exam Type</p>
                <span className={`mbe-audience-pill mbe-audience-pill--${isAlumniExam ? 'alumni' : 'student'} mbe-audience-pill--lg`}>
                  {isAlumniExam ? 'Alumni Exam' : 'Student Exam'}
                </span>
              </div>

              {/* Name */}
              <div className="mbe-review-block">
                <p className="mbe-review-label">Exam Name</p>
                <p className="mbe-review-value">{form.name || <em className="mbe-review-empty">Not set</em>}</p>
              </div>

              {/* Program */}
              <div className="mbe-review-block">
                <p className="mbe-review-label">Program</p>
                <p className="mbe-review-value">
                  {selectedProgram ? `${selectedProgram.name}${selectedProgram.code ? ` (${selectedProgram.code})` : ''}` : <em className="mbe-review-empty">Not selected</em>}
                </p>
              </div>

              {/* Status */}
              <div className="mbe-review-block">
                <p className="mbe-review-label">Status</p>
                <span className={`mbe-status-pill mbe-status-pill--${form.status}`}>{getStatusLabel(form.status)}</span>
              </div>

              {/* Schedule */}
              <div className="mbe-review-block mbe-review-block--full">
                <p className="mbe-review-label">Schedule</p>
                <p className="mbe-review-value">
                  {form.startDateTime && form.endDateTime
                    ? <>{new Date(form.startDateTime).toLocaleString()} → {new Date(form.endDateTime).toLocaleString()}{computedDuration && !computedDuration.includes('Invalid') ? <span className="mbe-review-duration"> ({computedDuration})</span> : null}</>
                    : <em className="mbe-review-empty">No schedule set</em>}
                </p>
              </div>

              {/* Passing threshold */}
              <div className="mbe-review-block">
                <p className="mbe-review-label">Passing Threshold</p>
                <p className="mbe-review-value">{form.passingThreshold}%</p>
              </div>

              {/* Timer (alumni only) */}
              {isAlumniExam && (
                <div className="mbe-review-block">
                  <p className="mbe-review-label">Attempt Timer</p>
                  <p className="mbe-review-value">
                    {attemptTimedByQuestions
                      ? `Timed by the question timers — ${formatDurationFromSeconds(totalQuestionSeconds) || 'no questions yet'} per attempt`
                      : form.isTimed
                        ? `Timed — ${formatDurationFromMinutes(form.timeLimitMinutes) || `${form.timeLimitMinutes} min`} per attempt`
                        : 'Untimed'}
                  </p>
                </div>
              )}

              {/* Question settings */}
              <div className="mbe-review-block">
                <p className="mbe-review-label">Points</p>
                <p className="mbe-review-value">
                  {usesCustomPoints ? 'Custom points' : '1 point each'} — {totalPoints} point{totalPoints === 1 ? '' : 's'} in all
                </p>
              </div>

              <div className="mbe-review-block">
                <p className="mbe-review-label">Question Timer</p>
                <p className="mbe-review-value">
                  {usesQuestionTimer
                    ? `On — ${formatDurationFromSeconds(totalQuestionSeconds) || 'no questions yet'} in all`
                    : 'Off'}
                </p>
              </div>

              <div className="mbe-review-block">
                <p className="mbe-review-label">One-Way Navigation</p>
                <p className="mbe-review-value">
                  {usesOneWay
                    ? `On — one question at a time, ${form.oneWayBackAllowed ? 'going back to look allowed' : 'no going back'}`
                    : 'Off'}
                </p>
              </div>

              {/* Subjects */}
              <div className="mbe-review-block mbe-review-block--full">
                <p className="mbe-review-label">Subjects ({selectedTagIds.length})</p>
                {selectedTagIds.length === 0
                  ? <em className="mbe-review-empty">No subjects selected</em>
                  : (
                    <div className="mbe-review-tag-list">
                      {filteredSubjectOptions.map(tag => (
                        <span key={tag._id} className="mbe-subject-pill">{tag.name}</span>
                      ))}
                    </div>
                  )}
              </div>

              {/* Questions breakdown */}
              <div className="mbe-review-block mbe-review-block--full">
                <p className="mbe-review-label">Questions ({selectedQuestions.length} total)</p>
                {selectedQuestions.length === 0
                  ? <em className="mbe-review-empty">No questions selected</em>
                  : (
                    <div className="mbe-review-subject-breakdown">
                      {Object.entries(questionsBySubject).map(([name, count]) => (
                        <div key={name} className="mbe-review-subject-row">
                          <span className="mbe-subject-pill">{name}</span>
                          <span className="mbe-review-q-count">{count} question{count !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

            </div>

            {!isModal && (
              <div className="mbe-tab-footer">
                <div className="mbe-review-actions">
                  {onTestRun && (
                    <button
                      className="mbe-btn mbe-btn-secondary"
                      type="button"
                      onClick={openTestRun}
                      disabled={saving || selectedQuestions.length === 0 || !questionSettingsValid}
                      title={selectedQuestions.length === 0
                        ? 'Add questions to the exam first'
                        : !questionSettingsValid
                          ? 'Fix the points or times in Question Settings first'
                          : 'Take the exam as it stands, without saving it'}
                    >
                      Test Run
                    </button>
                  )}
                  <button className="mbe-btn mbe-btn-primary" type="submit" disabled={saving}>
                    {saving ? 'Saving...' : isEditing ? 'Update Mock Board Exam' : 'Create Mock Board Exam'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── The window's buttons, pinned below whichever tab is open ─────── */}
        {isModal && (
          <div className="modal-actions mbe-modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="modal-btn-primary" disabled={saving || !isFormReady}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}

      </form>

      {/* ── Fullscreen image overlay ── over the window too, when the form is in one ── */}
      {isModal && imageOverlay ? createPortal(imageOverlay, document.body) : imageOverlay}

      {/* ── Feedback modal ────────────────────────────────────────────────── */}
      <FeedbackModal
        open={!!feedbackModal}
        onClose={() => setFeedbackModal(null)}
        title={feedbackModal?.title || 'Notification'}
        tone={feedbackModal?.tone || 'info'}
        message={feedbackModal?.message}
      />

      {/* ── "Apply to all" replaces the questions' own points or times ─────── */}
      <ConfirmationModal
        open={!!applyAllSetting}
        onClose={() => setApplyAllSetting(null)}
        onConfirm={() => applyDefaultToAll(applyAllSetting)}
        title={applyAllSetting === 'points' ? 'Apply Points to All?' : 'Apply Time to All?'}
        message={applyAllSetting === 'points'
          ? `${ownPointsCount} question${ownPointsCount === 1 ? ' has its' : 's have their'} own points. They will all be worth ${form.defaultQuestionPoints} point${Number(form.defaultQuestionPoints) === 1 ? '' : 's'}.`
          : `${ownSecondsCount} question${ownSecondsCount === 1 ? ' has its' : 's have their'} own time. They will all get ${formatDurationFromSeconds(form.defaultQuestionSeconds) || 'the time per question'}.`}
        confirmLabel="Apply to All"
        confirmVariant="primary"
      />

      {/* ── Return question modal ─────────────────────────────────────────── */}
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

      {/* ── Add/Remove All Filtered confirmation modal ────────────────────── */}
      {filteredBulkModal && (
        <Modal
          open={!!filteredBulkModal}
          onClose={() => setFilteredBulkModal(null)}
          title={
            filteredBulkModal === 'remove'
              ? 'Remove All Filtered'
              : getFilterDescription() ? 'Add All Filtered' : 'Add All Questions'
          }
          size="compact"
          bodyClassName="custom-modal-body--compact"
        >
          <div className="modal-confirmation">
            <div className="modal-confirmation-message">
              {filteredBulkModal === 'remove' ? 'Remove' : 'Add'}{' '}
              <strong>{filteredApprovedQuestions.length}</strong> question{filteredApprovedQuestions.length !== 1 ? 's' : ''}{' '}
              {filteredBulkModal === 'remove' ? 'from' : 'to'} exam?
            </div>
            <div className="modal-confirmation-extra">
              {filteredBulkModal === 'remove' ? (
                <>This will remove all <strong>{filteredApprovedQuestions.length}</strong> currently visible selected questions{getFilterDescription() ? <> matching <em>{getFilterDescription()}</em></> : null} across all pages.</>
              ) : getFilterDescription() ? (
                <>This will add all <strong>{filteredApprovedQuestions.length}</strong> questions matching <em>{getFilterDescription()}</em> across all pages.</>
              ) : (
                <>This will add all <strong>{filteredApprovedQuestions.length}</strong> available questions across all pages.</>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={() => setFilteredBulkModal(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={filteredBulkModal === 'remove' ? 'modal-btn-danger' : 'modal-btn-primary'}
              onClick={filteredBulkModal === 'remove' ? handleConfirmRemoveFiltered : handleConfirmAddFiltered}
            >
              {filteredBulkModal === 'remove' ? 'Confirm & Remove' : 'Confirm & Add'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// The Create Exam page. Exams are edited from Board Exams, in a window with this same form.
export default function MockBoardExam({ me, onExamSaved }) {
  // Review & Save's Test Run takes the exam as it stands, before it is saved. The test run shows in
  // the page's place while the form stays mounted underneath, hidden, so leaving the test run
  // returns to the form as it was, at the same scroll.
  const [testRunExam, setTestRunExam] = useState(null);
  const formScrollRef = useRef(0);

  function openTestRun(exam) {
    formScrollRef.current = window.scrollY;
    setTestRunExam(exam);
    window.scrollTo(0, 0);
  }

  function closeTestRun() {
    setTestRunExam(null);
    requestAnimationFrame(() => window.scrollTo(0, formScrollRef.current));
  }

  return (
    <>
      {testRunExam && <MockBoardExamTestRun draftExam={testRunExam} onBack={closeTestRun} />}
      <main className="mbe-page page-shell" style={testRunExam ? { display: 'none' } : undefined}>
        <PageHeader
          title="Mock Board Exam"
          subtitle="Create a new mock board exam for students or alumni."
        />
        <ExamForm me={me} onSaved={onExamSaved} onTestRun={openTestRun} />
      </main>
    </>
  );
}
