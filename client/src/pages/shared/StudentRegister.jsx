import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import PanelHeader from '../../components/PanelHeader.jsx';
import QuestionFilters from '../../components/QuestionFilters.jsx';
import { Marker, MarkerIcon, MarkerLegend } from '../../components/QuestionMarkers.jsx';
import { AudienceIcon } from '../../components/CalendarIcons.jsx';
import { useToast } from '../../components/Toast.jsx';
import usePanelLayout from '../../hooks/usePanelLayout.js';
import { isLoginLocked, lockedUntilLabel, unlockUserLogin, withLoginUnlocked } from '../../lib/loginLock.js';
import { formatDate, formatDateTime, formatTime } from '../../utils/dateFormat.js';
import BulkRegister from './BulkRegister.jsx';
import '../../styles/shared/QuestionApprovals.css';
import '../../styles/shared/StudentRegister.css';

const PAGE_SIZE = 10;

const TYPE_LABELS = { student: 'Student', alumni: 'Alumni' };

// The tabs: everyone, one type, or the accounts locked out of signing in
const TABS = [
  { value: '', label: 'All', countKey: 'all' },
  { value: 'student', label: 'Students', countKey: 'student' },
  { value: 'alumni', label: 'Alumni', countKey: 'alumni' },
  { value: 'locked', label: 'Locked', countKey: 'locked' },
];

const LOCK_ICON = (
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>
);

function TypeMarkerIcon({ type }) {
  return <AudienceIcon audience={type} width="13" height="13" strokeWidth="2.4" />;
}

const LEGEND_ITEMS = [
  ...Object.entries(TYPE_LABELS).map(([type, label]) => ({
    text: label,
    className: 'ca-marker--audience',
    content: <TypeMarkerIcon type={type} />,
  })),
  { text: 'Locked', className: 'sm-marker--locked', content: <MarkerIcon>{LOCK_ICON}</MarkerIcon> },
];

function getId(value) {
  return value?._id || value || '';
}

function formatProgramLabel(program) {
  return program?.name || program?.code || '-';
}

// Hours and minutes, the way the panel says how long a visit lasted
function formatHoursMinutes(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return '< 1m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

const EXAM_STATUS = {
  submitted: { label: 'Submitted', tone: 'good' },
  in_progress: { label: 'In progress', tone: 'warn' },
  abandoned: { label: 'Abandoned', tone: 'muted' },
};

// Last sign-in, how long that visit lasted, and the last exam they took
function AccountActivity({ accountId }) {
  const [activity, setActivity] = useState({ loading: true, error: '', data: null });
  const [loadCount, setLoadCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    setActivity({ loading: true, error: '', data: null });
    apiAuth(`/api/auth/users/${encodeURIComponent(accountId)}/activity`)
      .then((data) => {
        if (!ignore) setActivity({ loading: false, error: '', data });
      })
      .catch((err) => {
        if (!ignore) setActivity({ loading: false, error: err.message || 'The activity could not be loaded.', data: null });
      });
    return () => {
      ignore = true;
    };
  }, [accountId, loadCount]);

  if (activity.loading) return <p className="ca-hint ca-hint--section">Loading activity...</p>;
  if (activity.error) {
    return (
      <div className="ca-retry sm-activity-retry">
        <p className="ca-panel-note ca-panel-note--error" role="alert">{activity.error}</p>
        <button type="button" className="ca-btn ca-btn--plain" onClick={() => setLoadCount((count) => count + 1)}>Try again</button>
      </div>
    );
  }

  const { lastLoginAt, sessionMs, online, lastExam } = activity.data;
  const examStatus = lastExam ? EXAM_STATUS[lastExam.status] || { label: lastExam.status, tone: 'muted' } : null;
  const finished = lastExam?.status === 'submitted' && lastExam.endTime;

  return (
    <>
      <div className="ca-stats" style={{ '--ca-stat-columns': 2 }}>
        <div className="ca-stat">
          <span className="ca-stat-label">Last Sign-in</span>
          <strong className="ca-stat-value">{lastLoginAt ? formatTime(lastLoginAt) : '-'}</strong>
          <span className="ca-stat-sub">{lastLoginAt ? formatDate(lastLoginAt) : 'Not recorded yet'}</span>
        </div>
        <div className="ca-stat">
          <span className="ca-stat-label">Time Signed In</span>
          <strong className="ca-stat-value">{lastLoginAt ? formatHoursMinutes(sessionMs) : '-'}</strong>
          <span className="ca-stat-sub">
            {!lastLoginAt ? 'Not recorded yet' : online ? 'so far, online now' : 'on their last visit'}
          </span>
        </div>
      </div>
      <div className="question-panel-body ca-person-head sm-last-exam">
        <span className="ca-person-text">
          <span className="ca-stat-label">Last Exam Answered</span>
          {lastExam ? (
            <>
              <span className="ca-person-name">
                {lastExam.name}
                {lastExam.attemptNumber > 1 && <span className="ca-person-id">Attempt {lastExam.attemptNumber}</span>}
              </span>
              <span className="ca-person-meta">
                {finished ? 'Submitted' : 'Started'} {formatDateTime(finished ? lastExam.endTime : lastExam.startTime)}
              </span>
            </>
          ) : (
            <span className="ca-person-meta">No exams taken yet</span>
          )}
        </span>
        {examStatus && (
          <span className="ca-person-result">
            <span className={`ca-tone-pill ca-tone-pill--${examStatus.tone}`}>{examStatus.label}</span>
          </span>
        )}
      </div>
    </>
  );
}

function AccountDetails({ account }) {
  const isAlumni = account.role === 'alumni';
  const facts = [
    { label: 'Email', value: account.email },
    { label: isAlumni ? 'Alumni ID' : 'Student ID', value: (isAlumni ? account.alumniId : account.studentId) || '-' },
    { label: 'Type', value: TYPE_LABELS[account.role] || account.role },
    { label: 'Program', value: formatProgramLabel(account.program) },
    { label: 'Department', value: account.department?.name || '-' },
    { label: 'Registered', value: account.createdAt ? formatDateTime(account.createdAt) : '-' },
    { label: 'Last Active', value: account.last_active_at ? formatDateTime(account.last_active_at) : 'No activity yet' },
    { label: 'Account', value: account.isActive === false ? 'Deactivated' : 'Active' },
  ];

  return (
    <>
      <section className="question-panel">
        <p className="question-panel-label">Activity</p>
        <AccountActivity accountId={account._id} />
      </section>

      <section className="ca-section ca-review-metadata">
        <div className="ca-meta-grid">
          {facts.map((fact) => (
            <div key={fact.label}>
              <span className="ca-meta-label">{fact.label}</span>
              <div className="ca-meta-value">{fact.value}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function StudentManager({ me }) {
  const { notify } = useToast();
  const isDean = me?.role === 'dean';
  const scope = isDean ? 'department' : 'program';

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [tab, setTab] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [programs, setPrograms] = useState([]);
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);

  // The panel shows the account last clicked, even after the list moves on
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const selectedId = selectedAccount?._id || null;
  const panelLayout = usePanelLayout(selectedId);

  // A dean can narrow the list to one of their department's programs
  useEffect(() => {
    if (!isDean) return undefined;
    const departmentId = getId(me?.department);
    if (!departmentId) return undefined;
    let ignore = false;
    apiAuth(`/api/catalog/programs?departmentId=${encodeURIComponent(departmentId)}`)
      .then((data) => {
        if (!ignore) setPrograms(data.programs || []);
      })
      .catch(() => {
        if (!ignore) notify('Programs could not be loaded for the filter.', { variant: 'error' });
      });
    return () => {
      ignore = true;
    };
  }, [isDean, me?.department, notify]);

  // Every account is loaded once, the way the other list pages load theirs, so the tabs, search,
  // sort and pages work in the browser without waiting on the server. It loads again after a batch
  // is registered.
  const loadAccounts = useCallback(async () => {
    try {
      const data = await apiAuth('/api/auth/users?role=student,alumni&all=true');
      const users = data.users || [];
      setAccounts(users);
      setListError('');
      // Keep the open account current
      setSelectedAccount((current) => (current ? users.find((user) => user._id === current._id) || current : current));
    } catch (err) {
      setListError(err.message || 'Failed to load the accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    setCurrentPage(1);
  }, [tab, searchQuery, programFilter, sortBy]);

  // Everything but the tab, so each tab's count says what picking it would show
  const filteredExceptTab = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return accounts.filter((account) => {
      if (isDean && programFilter && String(getId(account.program)) !== String(programFilter)) return false;
      if (!query) return true;
      return [account.name, account.email, account.studentId, account.alumniId]
        .some((value) => (value || '').toLowerCase().includes(query));
    });
  }, [accounts, searchQuery, programFilter, isDean]);

  const counts = useMemo(() => ({
    all: filteredExceptTab.length,
    student: filteredExceptTab.filter((account) => account.role === 'student').length,
    alumni: filteredExceptTab.filter((account) => account.role === 'alumni').length,
    locked: filteredExceptTab.filter((account) => isLoginLocked(account)).length,
  }), [filteredExceptTab]);

  // Newest registered first, or oldest; accounts registered together keep their order
  const visibleAccounts = useMemo(() => {
    const listed = filteredExceptTab.filter((account) => {
      if (tab === 'locked') return isLoginLocked(account);
      return !tab || account.role === tab;
    });
    const registeredAt = (account) => new Date(account.createdAt || 0).getTime();
    return [...listed].sort((a, b) => {
      const order = registeredAt(a) - registeredAt(b) || String(a._id).localeCompare(String(b._id));
      return sortBy === 'oldest' ? order : -order;
    });
  }, [filteredExceptTab, tab, sortBy]);

  const paginatedAccounts = visibleAccounts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // The list scrolls on its own: each page or filter starts at the top...
  const listScrollRef = useRef(null);
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [currentPage, tab, searchQuery, programFilter, sortBy]);

  // ...and the open account's card stays in view when the columns change, once they finish gliding
  useEffect(() => {
    listScrollRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, currentPage, panelLayout.isExpanded, panelLayout.isGliding]);

  // Windows too short to fit the page scroll it, which can leave the panel partly off screen
  const panelRef = useRef(null);
  useEffect(() => {
    if (!selectedId) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selectedId]);

  async function handleUnlock() {
    const account = selectedAccount;
    if (!account || unlocking) return;
    setUnlocking(true);
    try {
      await unlockUserLogin(account._id);
      const unlocked = withLoginUnlocked(account);
      setSelectedAccount((current) => (current?._id === account._id ? unlocked : current));
      setAccounts((current) => current.map((item) => (item._id === account._id ? unlocked : item)));
      notify(`${account.name || account.email} can sign in again.`, { variant: 'success', title: 'Unlocked' });
    } catch (err) {
      notify(err.message || 'The account could not be unlocked.', { variant: 'error', title: 'Unlock' });
    } finally {
      setUnlocking(false);
    }
  }

  const hasActiveFilters = Boolean(searchQuery.trim() || tab || programFilter);

  function clearFilters() {
    setSearchQuery('');
    setTab('');
    setProgramFilter('');
  }

  function renderAccountCard(account, cardIndex) {
    const locked = isLoginLocked(account);
    const schoolId = account.role === 'alumni' ? account.alumniId : account.studentId;
    return (
      <div
        key={account._id}
        className={`ca-question-card ${account._id === selectedId ? 'is-active' : ''}`}
        style={{ '--card-index': cardIndex }}
        onClick={() => setSelectedAccount(account)}
      >
        <div className="ca-card-top">
          {/* Its click bubbles up to the card, so keyboard users can open the card too */}
          <button type="button" className="ca-card-open">
            <span className="ca-card-title">{account.name}</span>
          </button>
          <div className="ca-card-markers">
            {locked && (
              <Marker className="sm-marker--locked" label={lockedUntilLabel(account)}>
                <MarkerIcon>{LOCK_ICON}</MarkerIcon>
              </Marker>
            )}
            <Marker className="ca-marker--audience" label={TYPE_LABELS[account.role] || account.role}>
              <TypeMarkerIcon type={account.role} />
            </Marker>
          </div>
        </div>
        <div className="ca-card-meta">
          {isDean && <span className="ca-program-pill">{formatProgramLabel(account.program)}</span>}
          {schoolId && <span className="ca-tag-pill">{schoolId}</span>}
          <span className="ca-author sm-card-email">{account.email}</span>
          {account.createdAt && (
            <span className="ca-card-meta-datetime" title="Registered">
              <span className="ca-date">{formatDate(account.createdAt)}</span>
              <span className="ca-time">{formatTime(account.createdAt)}</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  const selectedLocked = selectedAccount ? isLoginLocked(selectedAccount) : false;

  return (
    <main className="sm-page ca-page page-shell">
      <PageHeader
        title="Student Registration"
        subtitle={`Register students and alumni for your ${scope}, and help them get signed in.`}
      >
        <div className="sm-header-actions">
          {!isDean && <span className="ca-program-chip">{me?.program?.name || 'Your Program'}</span>}
          <button type="button" className="qp-btn-add" onClick={() => setRegisterOpen(true)}>
            + Register Accounts
          </button>
        </div>
      </PageHeader>

      <CapsuleFilters
        className="ca-state-pills"
        ariaLabel="Filter accounts"
        options={TABS.map((item) => ({ value: item.value, label: item.label, count: counts[item.countKey] }))}
        value={tab}
        onChange={setTab}
      />

      <QuestionFilters
        className="ca-filters-wrapper sm-filters"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by name, email, or ID..."
        role={me?.role}
        programFilter={programFilter}
        onProgramChange={setProgramFilter}
        programOptions={programs}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      <div className={panelLayout.layoutClass(Boolean(selectedAccount))} onTransitionEnd={panelLayout.onLayoutTransitionEnd}>
        <section className="ca-list-panel" aria-label="Accounts">
          <MarkerLegend items={LEGEND_ITEMS} ariaLabel="What the account markers mean" />

          <div className="ca-list-scroll" ref={listScrollRef} aria-busy={loading}>
            {listError ? (
              <div className="ca-empty" role="alert">{listError}</div>
            ) : loading ? (
              <div className="ca-empty">Loading accounts...</div>
            ) : visibleAccounts.length === 0 ? (
              <div className="ca-empty">
                <p className="sm-empty-text">
                  {accounts.length === 0
                    ? `No students or alumni are registered for your ${scope} yet. Use Register Accounts to add them.`
                    : 'No accounts match your filters.'}
                </p>
                {accounts.length > 0 && hasActiveFilters && (
                  <button type="button" className="ca-btn ca-btn--plain sm-clear-filters" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              /* Keyed so the cards animate in for each new view, but not while typing a search */
              <div className="ca-questions-list" key={[tab, programFilter, sortBy, currentPage].join('|')}>
                {paginatedAccounts.map(renderAccountCard)}
              </div>
            )}
          </div>

          {!loading && !listError && (
            <Pagination
              currentPage={currentPage}
              totalItems={visibleAccounts.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              itemLabel={visibleAccounts.length === 1 ? 'account' : 'accounts'}
              classPrefix="ca"
              maxPageButtons={5}
            />
          )}
        </section>

        {selectedAccount ? (
          <div className={panelLayout.sidebarClass} ref={panelRef}>
            <PanelHeader
              title={selectedAccount.name}
              isExpanded={panelLayout.isExpanded}
              onToggleExpanded={panelLayout.toggleExpanded}
              isFullscreen={panelLayout.isFullscreen}
              onToggleFullscreen={panelLayout.toggleFullscreen}
              onClose={() => setSelectedAccount(null)}
              closeLabel="Close account details"
            />

            {/* Keyed so each account starts scrolled to the top */}
            <div className="ca-sidebar-content" key={selectedAccount._id}>
              <AccountDetails account={selectedAccount} />
            </div>

            {selectedLocked && (
              <div className="ca-sidebar-actions sm-unlock-bar">
                <p className="ca-hint">{lockedUntilLabel(selectedAccount)}, after too many wrong passwords.</p>
                <button type="button" className="ca-btn ca-btn--approve" onClick={handleUnlock} disabled={unlocking}>
                  {unlocking ? 'Unlocking...' : 'Unlock Sign-in'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="ca-sidebar ca-sidebar--empty">
            <p>Select an account to see its details</p>
          </div>
        )}
      </div>

      <BulkRegister
        user={me}
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onFinished={loadAccounts}
      />
    </main>
  );
}
