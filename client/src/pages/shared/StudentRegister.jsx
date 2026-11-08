import { useCallback, useEffect, useRef, useState } from 'react';
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
const SEARCH_DELAY_MS = 300;

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

function describeCredentials(account) {
  if (account.credentialsSent) {
    return account.credentialsSentAt ? `Sent ${formatDateTime(account.credentialsSentAt)}` : 'Sent';
  }
  if (account.credentialEmailError) return `Not sent: ${account.credentialEmailError}`;
  return 'Not sent yet';
}

function AccountDetails({ account }) {
  const locked = isLoginLocked(account);
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
        <p className="question-panel-label">Sign-in</p>
        <div className="question-panel-body sm-signin">
          <span className={`ca-tone-pill ca-tone-pill--${locked ? 'bad' : 'good'}`}>
            {locked ? 'Locked' : 'Can sign in'}
          </span>
          <p className="ca-hint">
            {locked
              ? `${lockedUntilLabel(account)}, after too many wrong passwords. Unlock it to let them try again now.`
              : account.loginFailedAttempts > 0
                ? `${account.loginFailedAttempts} wrong password ${account.loginFailedAttempts === 1 ? 'try' : 'tries'} since their last sign-in.`
                : 'No recent wrong passwords.'}
          </p>
        </div>
        <div className="question-panel-body sm-signin sm-signin--email">
          <span className="ca-meta-label">Sign-in Details Email</span>
          <span className={`ca-meta-value${!account.credentialsSent && account.credentialEmailError ? ' sm-value--bad' : ''}`}>
            {describeCredentials(account)}
          </span>
        </div>
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
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [tab, setTab] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [tab, debouncedSearch, programFilter, sortBy]);

  // The server pages, filters, sorts and counts the accounts
  useEffect(() => {
    let ignore = false;
    const params = new URLSearchParams({
      role: 'student,alumni',
      page: String(currentPage),
      limit: String(PAGE_SIZE),
      counts: 'true',
    });
    if (tab === 'locked') params.set('locked', 'true');
    else if (tab) params.set('type', tab);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (isDean && programFilter) params.set('program', programFilter);
    if (sortBy === 'oldest') params.set('sort', 'oldest');

    setLoading(true);
    apiAuth(`/api/auth/users?${params}`)
      .then((data) => {
        if (ignore) return;
        const users = data.users || [];
        setAccounts(users);
        setTotal(data.total || 0);
        setCounts(data.counts || {});
        setListError('');
        setLoading(false);
        // Keep the open account current when it is on this page
        setSelectedAccount((current) => (current ? users.find((user) => user._id === current._id) || current : current));
      })
      .catch((err) => {
        if (ignore) return;
        setListError(err.message || 'Failed to load the accounts.');
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [tab, debouncedSearch, programFilter, sortBy, currentPage, isDean, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  // The list scrolls on its own: each page or filter starts at the top...
  const listScrollRef = useRef(null);
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [currentPage, tab, debouncedSearch, programFilter, sortBy]);

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
      reload();
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
        options={TABS.map((item) => ({ value: item.value, label: item.label, count: counts[item.countKey] ?? 0 }))}
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
            ) : loading && accounts.length === 0 ? (
              <div className="ca-empty">Loading accounts...</div>
            ) : accounts.length === 0 ? (
              <div className="ca-empty">
                <p className="sm-empty-text">
                  {hasActiveFilters
                    ? 'No accounts match your filters.'
                    : `No students or alumni are registered for your ${scope} yet. Use Register Accounts to add them.`}
                </p>
                {hasActiveFilters && (
                  <button type="button" className="ca-btn ca-btn--plain sm-clear-filters" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              /* Keyed so the cards animate in for each new view, but not while typing a search */
              <div className="ca-questions-list" key={[tab, programFilter, sortBy, currentPage].join('|')}>
                {accounts.map(renderAccountCard)}
              </div>
            )}
          </div>

          {!listError && total > 0 && (
            <Pagination
              currentPage={currentPage}
              totalItems={total}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              itemLabel={total === 1 ? 'account' : 'accounts'}
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
              <div className="ca-sidebar-actions">
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
        onFinished={reload}
      />
    </main>
  );
}
