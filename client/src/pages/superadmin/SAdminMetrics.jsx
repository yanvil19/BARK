import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { apiAuth } from '../../lib/api.js';
import PageHeader from '../../components/PageHeader.jsx';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import '../../styles/superadmin/SAdminMetrics.css';

ChartJS.register(BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip);

// Checked for color-blind separation against the white card surface.
// Gold sits under 3:1 contrast, so every chart also has a legend and a table view.
const COLORS = {
  ok: '#4a56b0',
  clientError: '#eda100',
  serverError: '#d03b3b',
  p95: '#4a56b0',
  p50: '#a3abe3',
  students: '#4a56b0',
  alumni: '#eda100',
  actions: '#4a56b0',
  grid: '#eef0f8',
  axis: '#8b92bc',
  baseline: '#d8def2',
};

const RANGE_OPTIONS = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
];

const STEP_LABELS = {
  '1h': 'per minute',
  '24h': 'per 15 minutes',
  '7d': 'per 2 hours',
};

const SORT_OPTIONS = [
  { value: 'count', label: 'Most used' },
  { value: 'p95Ms', label: 'Slowest' },
  { value: 'errors', label: 'Most errors' },
];

const REFRESH_MS = 30 * 1000;
const ENDPOINT_PREVIEW = 10;
const FACULTY_ROLES = ['professor', 'program_chair', 'dean'];
const CHART_FONT = { family: "'Nunito', sans-serif", size: 11 };

// ─── Formatting ──────────────────────────────────────────────────────────────

const compactFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

function formatCount(n) {
  if (n === null || n === undefined) return '—';
  return Math.abs(n) >= 10000 ? compactFormat.format(n) : n.toLocaleString();
}

// Tables show exact values
function formatExact(n) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString();
}

function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

function formatRate(rate) {
  if (!rate) return '0%';
  if (rate < 0.001) return '<0.1%';
  return `${(rate * 100).toFixed(rate >= 0.1 ? 0 : 1)}%`;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return '<1m';
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatTime(t) {
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatAxisTime(t, range) {
  if (range === '7d') return new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric' });
  return formatTime(t);
}

function formatBucket(t, stepMs) {
  const start = new Date(t);
  if (stepMs <= 60 * 1000) return start.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const day = start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day}, ${formatTime(t)} – ${formatTime(t + stepMs)}`;
}

// "2026-10-18" -> "Oct 18", read as a calendar day (no time zone shift)
function formatDayKey(key, options = { month: 'short', day: 'numeric' }) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString([], options);
}

function plural(n, singular, pluralForm = `${singular}s`) {
  return `${formatCount(n)} ${n === 1 ? singular : pluralForm}`;
}

function describeActiveUsers(byRole = {}) {
  const faculty = FACULTY_ROLES.reduce((sum, role) => sum + (byRole[role] || 0), 0);
  const groups = [
    [byRole.student || 0, 'student', 'students'],
    [byRole.alumni || 0, 'alumnus', 'alumni'],
    [faculty, 'faculty', 'faculty'],
    [byRole.super_admin || 0, 'admin', 'admins'],
  ].filter(([n]) => n > 0);
  if (!groups.length) return 'Nobody in the last 5 minutes';
  return groups.map(([n, singular, pluralForm]) => plural(n, singular, pluralForm)).join(' · ');
}

// ─── Chart helpers ───────────────────────────────────────────────────────────

// The topmost visible, non-empty segment of a stacked column gets the rounded end
function isTopSegment(ctx) {
  const { chart, dataIndex, datasetIndex } = ctx;
  if (dataIndex === undefined) return true;
  const { datasets } = chart.data;
  for (let i = datasets.length - 1; i >= 0; i -= 1) {
    if (!chart.isDatasetVisible(i)) continue;
    if ((datasets[i].data[dataIndex] || 0) > 0) return i === datasetIndex;
  }
  return false;
}

function stackedBarStyle(color) {
  return {
    backgroundColor: color,
    hoverBackgroundColor: color,
    borderColor: '#ffffff',
    // A 2px surface gap above every segment that has another segment on top of it
    borderWidth: (ctx) => (isTopSegment(ctx) ? 0 : { top: 2, right: 0, bottom: 0, left: 0 }),
    borderRadius: (ctx) => (isTopSegment(ctx) ? 4 : 0),
    maxBarThickness: 24,
    categoryPercentage: 0.8,
    barPercentage: 0.9,
  };
}

// Show a dot only where a point has no neighbours, so a lone value isn't invisible
function isolatedPointRadius(ctx) {
  const data = ctx.dataset.data;
  const i = ctx.dataIndex;
  if (data[i] === null || data[i] === undefined) return 0;
  const prev = i > 0 ? data[i - 1] : null;
  const next = i < data.length - 1 ? data[i + 1] : null;
  return prev === null && next === null ? 3 : 0;
}

const crosshairPlugin = {
  id: 'samCrosshair',
  beforeDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.() || [];
    if (!active.length) return;
    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.strokeStyle = 'rgba(31, 41, 71, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

function xTickLimit(width) {
  if (width < 480) return 4;
  if (width < 800) return 6;
  return 8;
}

function baseOptions({ labels, tickLimit = 8, stacked = false, yTick = formatCount, tooltip = {} }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1f2947',
        titleFont: { ...CHART_FONT, size: 12, weight: '700' },
        bodyFont: { ...CHART_FONT, size: 12 },
        footerFont: { ...CHART_FONT, size: 12, weight: '700' },
        padding: 10,
        cornerRadius: 8,
        boxPadding: 4,
        usePointStyle: true,
        ...tooltip,
      },
    },
    scales: {
      x: {
        stacked,
        grid: { display: false },
        border: { color: COLORS.baseline },
        ticks: {
          color: COLORS.axis,
          font: CHART_FONT,
          maxRotation: 0,
          autoSkip: true,
          // Fewer time labels on narrow charts so they don't run into each other
          maxTicksLimit: tickLimit,
          callback: (_, index) => labels[index],
        },
      },
      y: {
        stacked,
        beginAtZero: true,
        grid: { color: COLORS.grid },
        border: { display: false },
        ticks: { color: COLORS.axis, font: CHART_FONT, maxTicksLimit: 5, precision: 0, callback: (value) => yTick(value) },
      },
    },
  };
}

// ─── Building blocks ─────────────────────────────────────────────────────────

function StatTile({ label, value, note, status }) {
  return (
    <div className="sam-tile">
      <span className="sam-tile-label">{label}</span>
      <strong className="sam-tile-value">{value}</strong>
      {note ? (
        <span className="sam-tile-note">
          {status ? <span className={`sam-status-dot sam-status-dot--${status}`} aria-hidden="true" /> : null}
          {note}
        </span>
      ) : null}
    </div>
  );
}

function Legend({ items }) {
  return (
    <ul className="sam-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className={`sam-legend-key sam-legend-key--${item.shape || 'box'}`} style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

// A chart with a table view of the same numbers, for screen readers and exact values.
// `children` is a function that receives how many x-axis labels fit.
function ChartCard({ title, subtitle, legend, table, empty, children }) {
  const [view, setView] = useState('chart');
  const [tickLimit, setTickLimit] = useState(8);
  const chartRef = useRef(null);

  // Fewer time labels on narrow charts so they don't run into each other
  useEffect(() => {
    const element = chartRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setTickLimit(xTickLimit(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [view, empty]);

  return (
    <article className="sam-card">
      <header className="sam-card-head">
        <div>
          <h3 className="sam-card-title">{title}</h3>
          {subtitle ? <p className="sam-card-sub">{subtitle}</p> : null}
        </div>
        <div className="sam-view-toggle" role="group" aria-label={`${title} view`}>
          {['chart', 'table'].map((option) => (
            <button
              key={option}
              type="button"
              className={view === option ? 'is-active' : ''}
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {option === 'chart' ? 'Chart' : 'Table'}
            </button>
          ))}
        </div>
      </header>
      <div className="sam-card-body">
        {empty ? (
          <p className="sam-empty">{empty}</p>
        ) : view === 'chart' ? (
          <>
            {legend ? <Legend items={legend} /> : null}
            <div className="sam-chart" ref={chartRef}>{children(tickLimit)}</div>
          </>
        ) : (
          <div className="sam-table-scroll">
            <table className="sam-table">
              <thead>
                <tr>
                  {table.columns.map((column, i) => (
                    <th key={column} className={i ? 'sam-num' : ''}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, i) => (
                      <td key={i} className={i ? 'sam-num' : ''}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Charts ──────────────────────────────────────────────────────────────────

const OutcomeChart = memo(function OutcomeChart({ series, range, stepMs, tickLimit }) {
  const labels = series.map((point) => formatAxisTime(point.t, range));
  const data = {
    labels,
    datasets: [
      { label: 'Successful', data: series.map((p) => p.ok), ...stackedBarStyle(COLORS.ok) },
      { label: 'Client errors (4xx)', data: series.map((p) => p.clientErrors), ...stackedBarStyle(COLORS.clientError) },
      { label: 'Server errors (5xx)', data: series.map((p) => p.serverErrors), ...stackedBarStyle(COLORS.serverError) },
    ],
  };
  const options = baseOptions({
    labels,
    tickLimit,
    stacked: true,
    tooltip: {
      callbacks: {
        title: (items) => formatBucket(series[items[0].dataIndex].t, stepMs),
        label: (item) => `${item.dataset.label}: ${formatExact(item.raw)}`,
        footer: (items) => `Total: ${formatExact(series[items[0].dataIndex].count)}`,
      },
    },
  });
  return <Bar data={data} options={options} />;
});

const LatencyChart = memo(function LatencyChart({ series, range, stepMs, tickLimit }) {
  const labels = series.map((point) => formatAxisTime(point.t, range));
  const lineStyle = (color) => ({
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    borderCapStyle: 'round',
    borderJoinStyle: 'round',
    pointRadius: isolatedPointRadius,
    pointHoverRadius: 5,
    pointHoverBorderWidth: 2,
    pointHoverBorderColor: '#ffffff',
    pointHitRadius: 12,
    spanGaps: false,
    tension: 0,
  });
  const data = {
    labels,
    datasets: [
      { label: '95th percentile', data: series.map((p) => p.p95Ms), ...lineStyle(COLORS.p95) },
      { label: 'Median', data: series.map((p) => p.p50Ms), ...lineStyle(COLORS.p50) },
    ],
  };
  const options = baseOptions({
    labels,
    tickLimit,
    yTick: (value) => (value === 0 ? '0' : formatMs(value)),
    tooltip: {
      callbacks: {
        title: (items) => formatBucket(series[items[0].dataIndex].t, stepMs),
        label: (item) => `${item.dataset.label}: ${formatMs(item.raw)}`,
      },
      filter: (item) => item.raw !== null,
    },
  });
  return <Line data={data} options={options} plugins={[crosshairPlugin]} />;
});

const DailyBarChart = memo(function DailyBarChart({ days, datasets, stacked = false, tickLimit }) {
  const labels = days.map((day) => formatDayKey(day));
  const data = {
    labels,
    datasets: datasets.map((dataset) => ({
      label: dataset.label,
      data: dataset.data,
      ...stackedBarStyle(dataset.color),
    })),
  };
  const options = baseOptions({
    labels,
    tickLimit,
    stacked,
    tooltip: {
      callbacks: {
        title: (items) => formatDayKey(days[items[0].dataIndex], { weekday: 'long', month: 'short', day: 'numeric' }),
        label: (item) => `${item.dataset.label}: ${formatExact(item.raw)}`,
      },
    },
  });
  return <Bar data={data} options={options} />;
});

// ─── Endpoints table ─────────────────────────────────────────────────────────

function sortRoutes(routes, sortBy) {
  const sorted = [...routes];
  if (sortBy === 'p95Ms') sorted.sort((a, b) => (b.p95Ms ?? -1) - (a.p95Ms ?? -1));
  else if (sortBy === 'errors') {
    sorted.sort((a, b) => (b.serverErrors - a.serverErrors) || (b.clientErrors - a.clientErrors) || (b.count - a.count));
  } else sorted.sort((a, b) => b.count - a.count);
  return sorted;
}

function EndpointsCard({ routes }) {
  const [sortBy, setSortBy] = useState('count');
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => sortRoutes(routes, sortBy), [routes, sortBy]);
  const shown = showAll ? sorted : sorted.slice(0, ENDPOINT_PREVIEW);

  return (
    <article className="sam-card">
      <header className="sam-card-head">
        <div>
          <h3 className="sam-card-title">Endpoints</h3>
          <p className="sam-card-sub">Grouped by route pattern, so IDs and query strings are never recorded</p>
        </div>
        <CapsuleFilters options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} ariaLabel="Sort endpoints" className="sam-sort" />
      </header>
      <div className="sam-card-body sam-card-body--flush">
        {routes.length === 0 ? (
          <p className="sam-empty">No endpoints were called in this time range.</p>
        ) : (
          <>
            <div className="sam-table-scroll sam-table-scroll--wide">
              <table className="sam-table sam-endpoints">
                <thead>
                  <tr>
                    <th>Endpoint</th>
                    <th className="sam-num">Requests</th>
                    <th className="sam-num">4xx</th>
                    <th className="sam-num">5xx</th>
                    <th className="sam-num">Average</th>
                    <th className="sam-num">95th pct.</th>
                    <th className="sam-num">Slowest</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((route) => (
                    <tr key={route.route}>
                      <td>
                        <span className="sam-endpoint">
                          {route.method ? <span className="sam-method">{route.method}</span> : null}
                          <code title={route.path}>{route.path}</code>
                        </span>
                      </td>
                      <td className="sam-num">{formatExact(route.count)}</td>
                      <td className="sam-num">{formatExact(route.clientErrors)}</td>
                      <td className="sam-num">
                        {route.serverErrors > 0 ? (
                          <span className="sam-error-count">
                            <span className="sam-status-dot sam-status-dot--critical" aria-hidden="true" />
                            {formatExact(route.serverErrors)}
                          </span>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td className="sam-num">{formatMs(route.avgMs)}</td>
                      <td className="sam-num">{formatMs(route.p95Ms)}</td>
                      <td className="sam-num">{formatMs(route.maxMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sorted.length > ENDPOINT_PREVIEW ? (
              <button type="button" className="sam-link" onClick={() => setShowAll((value) => !value)}>
                {showAll ? 'Show fewer' : `Show all ${sorted.length} endpoints`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminMetrics() {
  const [range, setRange] = useState('24h');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(async (selectedRange) => {
    const requestId = ++requestIdRef.current;
    setRefreshing(true);
    try {
      const res = await apiAuth(`/api/stats/system-metrics?range=${selectedRange}`);
      if (requestId !== requestIdRef.current) return;
      setData(res);
      setError('');
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err?.message || 'Failed to load metrics');
    } finally {
      if (requestId === requestIdRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(range);
    const timer = setInterval(() => {
      if (!document.hidden) load(range);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, range]);

  const requests = data?.requests;
  const showingRange = requests?.range === range;
  const totals = requests?.totals;
  const stepLabel = STEP_LABELS[requests?.range] || '';

  const outcomeTable = useMemo(() => {
    if (!requests) return null;
    return {
      columns: ['Time', 'Successful', '4xx', '5xx', 'Total'],
      rows: requests.series
        .filter((point) => point.count > 0)
        .map((point) => [
          formatBucket(point.t, requests.stepMs),
          formatExact(point.ok),
          formatExact(point.clientErrors),
          formatExact(point.serverErrors),
          formatExact(point.count),
        ]),
    };
  }, [requests]);

  const latencyTable = useMemo(() => {
    if (!requests) return null;
    return {
      columns: ['Time', 'Median', '95th percentile'],
      rows: requests.series
        .filter((point) => point.count > 0)
        .map((point) => [formatBucket(point.t, requests.stepMs), formatMs(point.p50Ms), formatMs(point.p95Ms)]),
    };
  }, [requests]);

  const activity = data?.activity;
  const attemptsTable = useMemo(() => {
    if (!activity) return null;
    return {
      columns: ['Day', 'Students', 'Alumni', 'Total'],
      rows: activity.days.map((day, i) => {
        const students = activity.examAttempts.student[i];
        const alumni = activity.examAttempts.alumni[i];
        return [formatDayKey(day), formatExact(students), formatExact(alumni), formatExact(students + alumni)];
      }),
    };
  }, [activity]);

  const actionsTable = useMemo(() => {
    if (!activity) return null;
    return {
      columns: ['Day', 'Actions'],
      rows: activity.days.map((day, i) => [formatDayKey(day), formatExact(activity.adminActions[i])]),
    };
  }, [activity]);

  const trackingNote = (() => {
    if (!requests) return '';
    if (!requests.trackingSince) return 'Request tracking just started. Numbers appear here as soon as requests come in.';
    if (new Date(requests.trackingSince) > new Date(requests.from)) {
      return `Tracking started ${formatDateTime(requests.trackingSince)}, so earlier time slots are empty.`;
    }
    return '';
  })();

  const server = data?.server;
  const database = server?.database;
  const dbConnected = database?.state === 'connected';
  const loopDelay = server?.eventLoopDelay;
  const noTraffic = totals && totals.count === 0;
  const attemptsTotal = activity
    ? activity.examAttempts.student.reduce((a, b) => a + b, 0) + activity.examAttempts.alumni.reduce((a, b) => a + b, 0)
    : 0;
  const actionsTotal = activity ? activity.adminActions.reduce((a, b) => a + b, 0) : 0;

  return (
    <main className="sam-page page-shell">
      <PageHeader title="System Metrics" subtitle="Traffic, response times, and activity across NU-BOARD">
        <div className="sam-header-actions">
          <span className="sam-updated" aria-live="polite">
            {data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString()}` : 'Loading…'}
          </span>
          <button type="button" className="sam-refresh" onClick={() => load(range)} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </PageHeader>

      {error ? (
        <div className="sam-alert" role="alert">
          {error}
          {data ? ' Showing the last numbers that loaded.' : ''}
        </div>
      ) : null}

      {!data && !error ? <p className="sam-loading">Loading metrics…</p> : null}

      {data ? (
        <div className="sam-body">
          <section className="sam-section" aria-labelledby="sam-now">
            <div className="sam-section-head">
              <div>
                <h2 id="sam-now" className="sam-section-title">Right now</h2>
              </div>
            </div>
            <div className="sam-tiles">
              <StatTile label="Active users" value={formatCount(data.users.now)} note={describeActiveUsers(data.users.byRole)} />
              <StatTile label="Active in the last 24 hours" value={formatCount(data.users.last24h)} note="Users with the app open and in use" />
              <StatTile
                label="Live connections"
                value={formatCount(server.liveConnections)}
                note="Faculty pages listening for system updates"
              />
              <StatTile label="Server uptime" value={formatDuration(server.uptimeSec)} note={`Since ${formatDateTime(server.startedAt)}`} />
              <StatTile
                label="Database response"
                value={dbConnected ? formatMs(database.pingMs) : 'Offline'}
                note={dbConnected ? 'Connected' : `State: ${database?.state || 'unknown'}`}
                status={dbConnected ? 'good' : 'critical'}
              />
            </div>
          </section>

          <section className="sam-section" aria-labelledby="sam-requests">
            <div className="sam-section-head">
              <div>
                <h2 id="sam-requests" className="sam-section-title">Requests</h2>
                <p className="sam-section-sub">
                  Calls to the API. Kept for {requests.retentionDays} days, then deleted automatically.
                </p>
              </div>
              <CapsuleFilters options={RANGE_OPTIONS} value={range} onChange={setRange} ariaLabel="Time range" />
            </div>

            {trackingNote ? <p className="sam-note">{trackingNote}</p> : null}

            <div className={`sam-range-scope${showingRange ? '' : ' is-refreshing'}`}>
              <div className="sam-tiles sam-tiles--four">
                <StatTile label="Requests" value={formatCount(totals.count)} note={`About ${formatCount(totals.perMinute)} per minute`} />
                <StatTile
                  label="Server errors (5xx)"
                  value={formatRate(totals.serverErrorRate)}
                  note={plural(totals.serverErrors, 'request')}
                  status={totals.serverErrors > 0 ? 'critical' : 'good'}
                />
                <StatTile label="Client errors (4xx)" value={formatRate(totals.clientErrorRate)} note={plural(totals.clientErrors, 'request')} />
                <StatTile
                  label="Response time, 95th percentile"
                  value={formatMs(totals.p95Ms)}
                  note={`Median ${formatMs(totals.p50Ms)} · slowest ${formatMs(totals.maxMs)}`}
                />
              </div>

              <div className="sam-grid">
                <ChartCard
                  title="Requests by outcome"
                  subtitle={`Number of requests ${stepLabel}`}
                  legend={[
                    { label: 'Successful', color: COLORS.ok },
                    { label: 'Client errors (4xx)', color: COLORS.clientError },
                    { label: 'Server errors (5xx)', color: COLORS.serverError },
                  ]}
                  table={outcomeTable}
                  empty={noTraffic ? 'No requests in this time range yet.' : ''}
                >
                  {(tickLimit) => (
                    <OutcomeChart series={requests.series} range={requests.range} stepMs={requests.stepMs} tickLimit={tickLimit} />
                  )}
                </ChartCard>

                <ChartCard
                  title="Response time"
                  subtitle={`How long requests took, ${stepLabel}`}
                  legend={[
                    { label: '95th percentile', color: COLORS.p95, shape: 'line' },
                    { label: 'Median', color: COLORS.p50, shape: 'line' },
                  ]}
                  table={latencyTable}
                  empty={noTraffic ? 'No requests in this time range yet.' : ''}
                >
                  {(tickLimit) => (
                    <LatencyChart series={requests.series} range={requests.range} stepMs={requests.stepMs} tickLimit={tickLimit} />
                  )}
                </ChartCard>
              </div>

              <EndpointsCard routes={requests.routes} />
            </div>
          </section>

          <section className="sam-section" aria-labelledby="sam-activity">
            <div className="sam-section-head">
              <div>
                <h2 id="sam-activity" className="sam-section-title">Platform activity</h2>
                <p className="sam-section-sub">Last 14 days. Counts only, with no exam or question content.</p>
              </div>
            </div>
            <div className="sam-grid">
              <ChartCard
                title="Exam attempts started"
                subtitle={`${plural(attemptsTotal, 'attempt')} in 14 days`}
                legend={[
                  { label: 'Students', color: COLORS.students },
                  { label: 'Alumni', color: COLORS.alumni },
                ]}
                table={attemptsTable}
              >
                {(tickLimit) => (
                  <DailyBarChart
                    days={activity.days}
                    stacked
                    tickLimit={tickLimit}
                    datasets={[
                      { label: 'Students', data: activity.examAttempts.student, color: COLORS.students },
                      { label: 'Alumni', data: activity.examAttempts.alumni, color: COLORS.alumni },
                    ]}
                  />
                )}
              </ChartCard>

              <ChartCard
                title="Admin and faculty actions"
                subtitle={`${plural(actionsTotal, 'audit log entry', 'audit log entries')} in 14 days`}
                table={actionsTable}
              >
                {(tickLimit) => (
                  <DailyBarChart
                    days={activity.days}
                    tickLimit={tickLimit}
                    datasets={[{ label: 'Actions', data: activity.adminActions, color: COLORS.actions }]}
                  />
                )}
              </ChartCard>
            </div>
          </section>

          <section className="sam-section" aria-labelledby="sam-server">
            <div className="sam-section-head">
              <div>
                <h2 id="sam-server" className="sam-section-title">Server</h2>
                <p className="sam-section-sub">The API process that answered this page</p>
              </div>
            </div>
            <article className="sam-card">
              <dl className="sam-facts">
                <div>
                  <dt>Running since</dt>
                  <dd>{formatDateTime(server.startedAt)}</dd>
                </div>
                <div>
                  <dt>Memory in use</dt>
                  <dd>{server.memory.rssMB} MB</dd>
                </div>
                <div>
                  <dt>JavaScript heap</dt>
                  <dd>{server.memory.heapUsedMB} of {server.memory.heapTotalMB} MB</dd>
                </div>
                <div>
                  <dt>Event loop delay</dt>
                  <dd>
                    {loopDelay ? `${formatMs(loopDelay.p50Ms)} typical · ${formatMs(loopDelay.p99Ms)} worst` : 'Measuring…'}
                  </dd>
                </div>
                <div>
                  <dt>Node.js</dt>
                  <dd>{server.nodeVersion}</dd>
                </div>
                <div>
                  <dt>Activity time zone</dt>
                  <dd>{activity.timeZone}</dd>
                </div>
              </dl>
            </article>
          </section>
        </div>
      ) : null}
    </main>
  );
}
