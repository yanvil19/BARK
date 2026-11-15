import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import { Modal } from '../../components/Modal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import QuestionFilters from '../../components/QuestionFilters.jsx';
import Table from '../../components/Table.jsx';
import { IconAlumni, IconStudent } from '../../components/CalendarIcons.jsx';
import { useToast } from '../../components/Toast.jsx';
import { isLoginLocked, lockedUntilLabel, unlockUserLogin, withLoginUnlocked } from '../../lib/loginLock.js';
import { formatDate, formatDateTime, formatTime } from '../../utils/dateFormat.js';
import BulkRegister from './BulkRegister.jsx';
import '../../styles/shared/QuestionApprovals.css';
import '../../styles/shared/StudentRegister.css';

const PAGE_SIZE = 10;

const TYPE_LABELS = { student: 'Student', alumni: 'Alumni' };

// The two tables, side by side: students first, then alumni
const TABLES = [
  { type: 'student', title: 'Students', Icon: IconStudent, idKey: 'studentId', idLabel: 'Student ID' },
  { type: 'alumni', title: 'Alumni', Icon: IconAlumni, idKey: 'alumniId', idLabel: 'Alumni ID' },
];

// Everyone, or only the accounts locked out of signing in
const TABS = [
  { value: '', label: 'All', countKey: 'all' },
  { value: 'locked', label: 'Locked', countKey: 'locked' },
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
    <div className="sm-details">
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
    </div>
  );
}

// Whether they can sign in, as a table status: a coloured dot and a word
function accountStatus(account) {
  if (isLoginLocked(account)) return { label: 'Locked', tone: 'red' };
  if (account.isActive === false) return { label: 'Deactivated', tone: 'muted' };
  return { label: 'Active', tone: 'green' };
}

// One type's table: a title bar with its icon and count, the accounts, and its own pages
function AccountTable({ table, accounts, loading, isDean, filtered, filterKey, onOpen }) {
  const [page, setPage] = useState(1);
  const { type, title, Icon, idKey, idLabel } = table;
  const titleId = `sm-table-title-${type}`;
  const label = title.toLowerCase();

  // A new filter, search or sort starts again on the first page. Unlocking someone doesn't.
  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  // A page that no longer exists (the list got shorter) shows the last one
  const currentPage = Math.min(page, Math.max(1, Math.ceil(accounts.length / PAGE_SIZE)));
  const rows = accounts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const columns = [
    {
      key: 'name',
      header: 'Name',
      className: 'ui-table-cell-lead',
      headerClassName: 'sm-th-lead',
      // The button takes keyboard focus; its click goes up to the row, which opens the account
      render: (account) => (
        // Titles show a name or email the column cuts short
        <span className="sm-name-cell">
          <button type="button" className="sm-name-btn" title={account.name || account.email}>{account.name || account.email}</button>
          <span className="sm-email" title={account.email}>{account.email}</span>
        </span>
      ),
    },
    {
      key: idKey,
      header: idLabel,
      width: '118px',
      className: 'sm-id-cell',
      render: (account) => account[idKey] || '-',
    },
    ...(isDean ? [{
      key: 'program',
      header: 'Program',
      width: '84px',
      render: (account) => (
        <span className="sm-program" title={account.program?.name || undefined}>
          {account.program?.code || formatProgramLabel(account.program)}
        </span>
      ),
    }] : []),
    {
      key: 'createdAt',
      header: 'Registered',
      width: '112px',
      render: (account) => (account.createdAt ? formatDate(account.createdAt) : '-'),
    },
    {
      key: 'status',
      header: 'Status',
      width: '118px',
      render: (account) => {
        const status = accountStatus(account);
        return (
          <span
            className={`ui-table-status ui-table-status--${status.tone}`}
            title={status.label === 'Locked' ? lockedUntilLabel(account) : undefined}
          >
            {status.label}
          </span>
        );
      },
    },
  ];

  return (
    <section className={`sm-table sm-table--${type}`} aria-labelledby={titleId}>
      <header className="sm-table-head">
        <span className="sm-table-icon" aria-hidden="true">
          <Icon width="20" height="20" />
        </span>
        <h2 id={titleId} className="sm-table-title">{title}</h2>
        <span className="sm-table-count">{loading ? '-' : accounts.length}</span>
      </header>

      <Table
        columns={columns}
        data={rows}
        loading={loading}
        wrapperClassName="sm-table-card"
        className="sm-table-grid"
        onRowClick={(account) => onOpen(account)}
        emptyMessage={filtered ? `No ${label} match your filters.` : `No ${label} registered yet.`}
      />

      {/* Shown on one page too, so both tables end alike; an empty table has its message instead */}
      {!loading && accounts.length > 0 && (
        <div className="sm-table-footer">
          <Pagination
            currentPage={currentPage}
            totalItems={accounts.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel={label}
            maxPageButtons={5}
            alwaysShowControls
          />
        </div>
      )}
    </section>
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

  // The account whose details window is open
  const [openAccount, setOpenAccount] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

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

  // Every account is loaded once, the way the other list pages load theirs, so the filters, search,
  // sort and pages work in the browser without waiting on the server. It loads again after a batch
  // is registered.
  const loadAccounts = useCallback(async () => {
    try {
      const data = await apiAuth('/api/auth/users?role=student,alumni&all=true');
      const users = data.users || [];
      setAccounts(users);
      setListError('');
      // Keep the open account current
      setOpenAccount((current) => (current ? users.find((user) => user._id === current._id) || current : current));
    } catch (err) {
      setListError(err.message || 'Failed to load the accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Everything but the All / Locked filter, so each capsule's count says what picking it would show
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
    locked: filteredExceptTab.filter((account) => isLoginLocked(account)).length,
  }), [filteredExceptTab]);

  // Newest registered first, or oldest; accounts registered together keep their order. Each table
  // gets its own type.
  const accountsByType = useMemo(() => {
    const listed = filteredExceptTab.filter((account) => tab !== 'locked' || isLoginLocked(account));
    const registeredAt = (account) => new Date(account.createdAt || 0).getTime();
    const sorted = [...listed].sort((a, b) => {
      const order = registeredAt(a) - registeredAt(b) || String(a._id).localeCompare(String(b._id));
      return sortBy === 'oldest' ? order : -order;
    });
    return {
      student: sorted.filter((account) => account.role === 'student'),
      alumni: sorted.filter((account) => account.role === 'alumni'),
    };
  }, [filteredExceptTab, tab, sortBy]);

  async function handleUnlock() {
    const account = openAccount;
    if (!account || unlocking) return;
    setUnlocking(true);
    try {
      await unlockUserLogin(account._id);
      const unlocked = withLoginUnlocked(account);
      setOpenAccount((current) => (current?._id === account._id ? unlocked : current));
      setAccounts((current) => current.map((item) => (item._id === account._id ? unlocked : item)));
      notify(`${account.name || account.email} can sign in again.`, { variant: 'success', title: 'Unlocked' });
    } catch (err) {
      notify(err.message || 'The account could not be unlocked.', { variant: 'error', title: 'Unlock' });
    } finally {
      setUnlocking(false);
    }
  }

  const hasActiveFilters = Boolean(searchQuery.trim() || tab || programFilter);
  const nothingMatches = !loading && accounts.length > 0
    && accountsByType.student.length + accountsByType.alumni.length === 0;

  function clearFilters() {
    setSearchQuery('');
    setTab('');
    setProgramFilter('');
  }

  const openLocked = openAccount ? isLoginLocked(openAccount) : false;

  return (
    <main className="sm-page page-shell">
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

      {listError ? (
        <div className="sm-alert" role="alert">{listError}</div>
      ) : (
        <>
          {!loading && accounts.length === 0 && (
            <p className="sm-notice">
              No students or alumni are registered for your {scope} yet. Use Register Accounts to add them.
            </p>
          )}
          {nothingMatches && hasActiveFilters && (
            <div className="sm-notice">
              <span>No accounts match your filters.</span>
              <button type="button" className="ca-btn ca-btn--plain" onClick={clearFilters}>Clear filters</button>
            </div>
          )}
          <div className="sm-tables">
            {TABLES.map((table) => (
              <AccountTable
                key={table.type}
                table={table}
                accounts={accountsByType[table.type]}
                loading={loading}
                isDean={isDean}
                filtered={hasActiveFilters}
                filterKey={[tab, searchQuery, programFilter, sortBy].join('|')}
                onOpen={setOpenAccount}
              />
            ))}
          </div>
        </>
      )}

      <Modal
        open={Boolean(openAccount)}
        onClose={() => setOpenAccount(null)}
        title={openAccount?.name || 'Account'}
        size="compact"
      >
        {openAccount && (
          <>
            <AccountDetails account={openAccount} />
            {openLocked && (
              <p className="ca-hint sm-locked-note">{lockedUntilLabel(openAccount)}, after too many wrong passwords.</p>
            )}
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={() => setOpenAccount(null)}>Close</button>
              {openLocked && (
                <button type="button" className="modal-btn-primary" onClick={handleUnlock} disabled={unlocking}>
                  {unlocking ? 'Unlocking...' : 'Unlock Sign-in'}
                </button>
              )}
            </div>
          </>
        )}
      </Modal>

      <BulkRegister
        user={me}
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onFinished={loadAccounts}
      />
    </main>
  );
}
