import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import { formatDate, formatDateTime } from '../../utils/dateFormat.js';
import '../../styles/shared/AiOverview.css';

// The AI Overview view of the Exam Results panel. Every number, chart and table here comes from
// the figures the server worked out from the results (overview.facts); the AI wrote only the words
// (overview.content), and the server checked them against the figures. The state comes from
// hooks/useExamAiOverview.js; the page owns the Regenerate button and its confirmation.

const ROLE_LABELS = { dean: 'Dean', program_chair: 'Program Chair' };

// What the server flagged a question for, as the table shows it
const FLAGS = {
  check_key: { label: 'Check the key', tone: 'bad' },
  shared_mistake: { label: 'Shared mistake', tone: 'warn' },
  often_skipped: { label: 'Often skipped', tone: 'warn' },
  may_be_unclear: { label: 'May be unclear', tone: 'warn' },
  too_hard: { label: 'Too hard', tone: 'warn' },
  too_easy: { label: 'Too easy', tone: 'muted' },
};

const FINDING_TONES = {
  good: { className: 'is-good', label: 'Going well' },
  watch: { className: 'is-warn', label: 'Worth watching' },
  problem: { className: 'is-bad', label: 'Needs action' },
};

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function SparkleIcon({ className = 'aio-spark' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11 2.5l1.9 5.6 5.6 1.9-5.6 1.9L11 17.5l-1.9-5.6L3.5 10l5.6-1.9z" />
      <path d="M18.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" />
    </svg>
  );
}

function FindingIcon({ tone }) {
  if (tone === 'good') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 16l5-5 4 4 7-8" />
        <path d="M15 7h5v5" />
      </svg>
    );
  }
  if (tone === 'watch') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" />
      </svg>
    );
  }
  return <AlertIcon />;
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4 21 19.5H3z" />
      <path d="M12 10v4M12 16.8v.2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12h8" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 4v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

// A change in points, up or down, with words for screen readers
function Delta({ value }) {
  if (value === null || value === undefined) return null;
  if (value === 0) return <span className="aio-delta">no change</span>;
  const up = value > 0;
  return (
    <span className={`aio-delta ${up ? 'is-up' : 'is-down'}`}>
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path d={up ? 'M5 1.5 9 8H1z' : 'M5 8.5 1 2h8z'} fill="currentColor" />
      </svg>
      <span className="aio-sr">{up ? 'up ' : 'down '}</span>
      {Math.abs(value)} pts
    </span>
  );
}

function Quota({ limit, remaining }) {
  return (
    <span className="aio-quota" title="Generations left for this exam">
      <span className="aio-pips" aria-hidden="true">
        {Array.from({ length: limit }, (_, index) => (
          <i key={index} className={index < remaining ? '' : 'is-used'} />
        ))}
      </span>
      {remaining}/{limit} left
    </span>
  );
}

// The AI's words, with each question it names ("Q27") as a button that opens it
function LinkedText({ text, questionNumbers, onOpenQuestion }) {
  const parts = String(text || '').split(/(\bQ\d+\b)/g);
  return parts.map((part, index) => {
    const number = /^Q\d+$/.test(part) ? Number(part.slice(1)) : null;
    if (number && questionNumbers.has(number)) {
      return (
        <button
          key={index}
          type="button"
          className="aio-qlink"
          onClick={() => onOpenQuestion(number)}
          title={`Open ${part} in the Questions view`}
        >
          {part}
        </button>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function AiNote({ children }) {
  return (
    <p className="aio-note">
      <SparkleIcon />
      <span>{children}</span>
    </p>
  );
}

function NumbersTable({ head, rows }) {
  return (
    <details className="aio-numbers">
      <summary>Show the numbers</summary>
      <div className="aio-table-wrap">
        <table className="aio-table aio-table--mini">
          <thead>
            <tr>
              {head.map(({ label, num }) => <th key={label} className={num ? 'is-num' : ''}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, rowIndex) => (
              <tr key={rowIndex}>
                {cells.map((cell, cellIndex) => (
                  <td key={cellIndex} className={head[cellIndex].num ? 'is-num' : ''}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const signed = (value) => (value === null || value === undefined ? '-' : `${value > 0 ? '+' : ''}${value}`);

// ── Topics: this exam's score per topic (dot), the previous exam's (ring), and the passing line ──

function TopicChart({ topics, threshold, currentLabel, previousLabel }) {
  const [hovered, setHovered] = useState(null);
  const rows = useMemo(() => topics.slice().sort((a, b) => a.score - b.score), [topics]);
  const hasPrevious = rows.some((topic) => topic.previous !== null && topic.previous !== undefined);

  // The axis covers the scores and the passing line, in steps of 10
  const values = rows.flatMap((topic) => [topic.score, topic.previous]).filter((value) => typeof value === 'number');
  const low = Math.max(0, Math.floor((Math.min(...values, threshold) - 5) / 10) * 10);
  const high = Math.min(100, Math.ceil((Math.max(...values, threshold) + 5) / 10) * 10);
  const span = Math.max(10, high - low);
  const step = span > 60 ? 20 : 10;
  const ticks = [];
  for (let tick = low; tick <= high; tick += step) ticks.push(tick);
  const at = (value) => `${((value - low) / span) * 100}%`;

  return (
    <>
      <ul className="aio-legend">
        <li><span className="aio-key-dot" />{currentLabel}</li>
        {hasPrevious && <li><span className="aio-key-ring" />{previousLabel}</li>}
        <li><span className="aio-key-dash" />Passing {threshold}%</li>
      </ul>
      <div className={`aio-db ${hasPrevious ? '' : 'is-single'}`}>
        {rows.map((topic) => {
          const hasBefore = typeof topic.previous === 'number';
          const label = hasBefore
            ? `${topic.name}: ${topic.score}% now, ${topic.previous}% before, ${topic.change >= 0 ? 'up' : 'down'} ${Math.abs(topic.change)} points`
            : `${topic.name}: ${topic.score}%`;
          const isOpen = hovered === topic.name;
          const position = ((topic.score - low) / span) * 100;
          return (
            <div
              key={topic.name}
              className={`aio-db-row ${isOpen ? 'is-hovered' : ''}`}
              tabIndex={0}
              aria-label={label}
              onPointerEnter={() => setHovered(topic.name)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(topic.name)}
              onBlur={() => setHovered(null)}
            >
              <span className="aio-db-name">{topic.name}</span>
              <span className="aio-db-track" aria-hidden="true">
                <span className="aio-db-threshold" style={{ left: at(threshold) }} />
                {hasBefore && (
                  <>
                    <span
                      className="aio-db-link"
                      style={{
                        left: at(Math.min(topic.previous, topic.score)),
                        width: `${(Math.abs(topic.score - topic.previous) / span) * 100}%`,
                      }}
                    />
                    <span className="aio-db-prev" style={{ left: at(topic.previous) }} />
                  </>
                )}
                <span className="aio-db-now" style={{ left: at(topic.score) }} />
                {isOpen && (
                  <span
                    className={`aio-tip ${position < 22 ? 'is-start' : position > 78 ? 'is-end' : ''}`}
                    style={{ left: at(topic.score) }}
                  >
                    <span className="aio-tip-title">{topic.name}</span>
                    <span className="aio-tip-row"><span className="aio-key-dot" /><b>{topic.score}%</b>{currentLabel}</span>
                    {hasBefore && (
                      <>
                        <span className="aio-tip-row"><span className="aio-key-ring" /><b>{topic.previous}%</b>{previousLabel}</span>
                        <span className="aio-tip-row"><b>{signed(topic.change)} pts</b>{topic.change >= 0 ? 'better' : 'worse'}</span>
                      </>
                    )}
                  </span>
                )}
              </span>
              <span className="aio-db-val">{topic.score}%</span>
              {hasPrevious && <span className="aio-db-delta">{hasBefore ? <Delta value={topic.change} /> : <span className="aio-muted">new</span>}</span>}
            </div>
          );
        })}
        <div className="aio-db-axis" aria-hidden="true">
          <span />
          <span className="aio-db-ticks">
            {ticks.map((tick) => <span key={tick} style={{ left: at(tick) }}>{tick}%</span>)}
          </span>
          <span />
          {hasPrevious && <span />}
        </div>
      </div>
    </>
  );
}

// ── Progress: the average and pass rate of the program's exams, oldest first ──

const SERIES = [
  { key: 'average', name: 'Average score', className: 'is-1' },
  { key: 'passRate', name: 'Pass rate', className: 'is-2' },
];

function shortDay(date) {
  return date ? String(date).split(',')[0] : '';
}

function TrendChart({ trend, threshold }) {
  const hostRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(null);

  // Drawn to the panel's width, which changes when it widens or goes full screen
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const measure = () => setWidth(host.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const chartWidth = Math.max(280, width);
  const height = 230;
  const pad = { top: 14, right: chartWidth < 420 ? 86 : 100, bottom: 46, left: 40 };
  const plotWidth = chartWidth - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (index) => pad.left + (trend.length === 1 ? plotWidth / 2 : (index / (trend.length - 1)) * plotWidth);
  const y = (value) => pad.top + plotHeight - (value / 100) * plotHeight;
  const band = trend.length > 1 ? plotWidth / (trend.length - 1) : plotWidth;
  const maxChars = Math.max(5, Math.floor(band / 7));
  const shorten = (name) => (name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name);

  // The labels at the end of the lines, moved apart when the two values are close
  const last = trend[trend.length - 1];
  const endLabels = SERIES.map((series) => ({ ...series, value: last[series.key], top: y(last[series.key]) }));
  const [first, second] = endLabels;
  const gap = 30;
  if (Math.abs(first.top - second.top) < gap) {
    const middle = (first.top + second.top) / 2;
    const firstIsHigher = first.value >= second.value;
    first.top = middle + (firstIsHigher ? -gap / 2 : gap / 2);
    second.top = middle + (firstIsHigher ? gap / 2 : -gap / 2);
  }

  const description = `Average score and pass rate across ${trend.length} exams. ${SERIES.map((series) => (
    `${series.name}: ${trend.map((point) => `${point[series.key]}%`).join(', ')}`
  )).join('. ')}.`;

  const activePoint = active === null ? null : trend[active];

  return (
    <div className="aio-trend" ref={hostRef}>
      {width > 0 && (
        <svg viewBox={`0 0 ${chartWidth} ${height}`} height={height} role="img" aria-label={description}>
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line className="aio-trend-grid" x1={pad.left} x2={pad.left + plotWidth} y1={y(tick)} y2={y(tick)} />
              <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end">{tick}%</text>
            </g>
          ))}
          <line className="aio-trend-threshold" x1={pad.left} x2={pad.left + plotWidth} y1={y(threshold)} y2={y(threshold)} />
          <text x={pad.left + 4} y={y(threshold) - 6}>Passing {threshold}%</text>

          {activePoint && (
            <line className="aio-trend-cross" x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + plotHeight} />
          )}

          {SERIES.map((series) => (
            <g key={series.key} className={`aio-trend-series ${series.className}`}>
              <path d={trend.map((point, index) => `${index ? 'L' : 'M'}${x(index)},${y(point[series.key])}`).join(' ')} />
              {trend.map((point, index) => (
                <circle key={index} cx={x(index)} cy={y(point[series.key])} r={active === index ? 5.5 : 4.5} />
              ))}
            </g>
          ))}
          {endLabels.map((label) => (
            <g key={label.key}>
              <text className="aio-trend-end" x={x(trend.length - 1) + 10} y={label.top + 4}>{label.value}%</text>
              <text x={x(trend.length - 1) + 10} y={label.top + 18}>{label.name}</text>
            </g>
          ))}

          {trend.map((point, index) => (
            <g key={index}>
              <text className={`aio-trend-x ${point.current ? 'is-current' : ''}`} x={x(index)} y={pad.top + plotHeight + 18} textAnchor="middle">
                {point.current ? 'This exam' : shorten(point.name)}
              </text>
              <text x={x(index)} y={pad.top + plotHeight + 33} textAnchor="middle">{shortDay(point.date)}</text>
            </g>
          ))}

          {/* One target per exam, wider than its points */}
          {trend.map((point, index) => (
            <rect
              key={index}
              className="aio-trend-hit"
              x={x(index) - band / 2}
              y={pad.top}
              width={band}
              height={plotHeight}
              tabIndex={0}
              aria-label={`${point.name}${point.date ? `, ${point.date}` : ''}: average ${point.average}%, pass rate ${point.passRate}%, ${plural(point.takers, 'taker')}`}
              onPointerEnter={() => setActive(index)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>
      )}
      {activePoint && (
        <div
          className={`aio-tip aio-tip--chart ${x(active) > chartWidth - 190 ? 'is-end' : ''}`}
          style={{ left: x(active), top: y(Math.max(activePoint.average, activePoint.passRate)) }}
        >
          <span className="aio-tip-title">{activePoint.name}{activePoint.date ? ` · ${activePoint.date}` : ''}</span>
          <span className="aio-tip-row"><span className="aio-key-line is-1" /><b>{activePoint.average}%</b>Average score</span>
          <span className="aio-tip-row"><span className="aio-key-line is-2" /><b>{activePoint.passRate}%</b>Pass rate</span>
          <span className="aio-tip-row"><b>{activePoint.takers}</b>{activePoint.takers === 1 ? 'taker' : 'takers'}</span>
        </div>
      )}
    </div>
  );
}

// ── States before there is an overview to read ──

function GeneratingCard({ takers, questionCount, startedBy }) {
  const [step, setStep] = useState(0);
  const steps = [
    `Gathering the results of ${plural(takers, 'taker')}`,
    `Checking ${plural(questionCount, 'question')} and how they were answered`,
    'Comparing with earlier exams',
    'Writing the overview',
  ];

  // The steps tick along while it works; the last one stays open until the overview is saved
  useEffect(() => {
    const timer = setInterval(() => setStep((current) => Math.min(current + 1, 3)), 1600);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="aio-gen" role="status">
      <div className="aio-gen-card">
        <div className="aio-gen-head">
          <span className="aio-spinner" aria-hidden="true" />
          <div>
            <h3>Writing the AI overview...</h3>
            <p>
              This usually takes 10 to 40 seconds. You can leave this view; it keeps going and saves when done.
              {startedBy && <> Started by <strong>{startedBy}</strong>.</>}
            </p>
          </div>
        </div>
        <ol className="aio-gen-steps">
          {steps.map((text, index) => (
            <li key={text} className={index < step ? 'is-done' : index === step ? 'is-now' : ''}>
              <i>
                {index < step && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </i>
              {text}
            </li>
          ))}
        </ol>
      </div>
      {[[92, 84, 60], [70, 88, 76, 50], [95, 65]].map((widths, index) => (
        <div key={index} className="aio-skeleton" aria-hidden="true">
          <div className="aio-sk-head" />
          <div className="aio-sk-body">
            {widths.map((value, lineIndex) => <div key={lineIndex} className="aio-sk-line" style={{ width: `${value}%` }} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ limit, remaining, onGenerate }) {
  return (
    <div className="aio-empty">
      <div className="aio-empty-icon"><SparkleIcon /></div>
      <h3>Get an AI overview of these results</h3>
      <p>
        A short written read of how this exam went: what stands out, which topics and questions need attention, how it
        compares with the program&apos;s earlier exams, and what to do next.
      </p>
      <ul className="aio-includes">
        {['Summary', 'What stands out', 'Topics', 'Questions to review', 'Progress', 'Who needs support', 'Next steps'].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <Quota limit={limit} remaining={remaining} />
      <button type="button" className="aio-btn aio-btn--primary" onClick={onGenerate} disabled={remaining === 0}>
        <SparkleIcon />
        Generate AI Overview
      </button>
      <span className="aio-fine">
        Uses 1 of the {limit} generations for this exam, shared by its dean and program chair.
        <br />
        Only the figures of the results are sent: no names, IDs or question text.
      </span>
    </div>
  );
}

function Banner({ tone = 'warn', icon, children, action }) {
  return (
    <div className={`aio-banner aio-banner--${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {icon}
      <p>{children}</p>
      {action}
    </div>
  );
}

// ── The overview ──

function OverviewBody({ overview, data, onOpenQuestion, onOpenTopic, onOpenIndividual }) {
  const { facts, content } = overview;
  const { exam, summary, previous, groups } = facts;
  const isAlumni = exam.audience === 'alumni';
  const audienceNoun = isAlumni ? 'alumni' : 'students';
  const questionsByNumber = useMemo(
    () => new Map((facts.questions || []).map((question) => [question.number, question])),
    [facts.questions]
  );
  const questionNumbers = useMemo(() => new Set(questionsByNumber.keys()), [questionsByNumber]);
  const linked = (text) => <LinkedText text={text} questionNumbers={questionNumbers} onOpenQuestion={onOpenQuestion} />;

  const trend = facts.trend || [];
  const topics = facts.topics || [];
  const currentLabel = previous ? `${exam.name} (this exam)` : 'This exam';
  const previousLabel = previous ? `${previous.name}${previous.date ? ` (${previous.date})` : ''}` : '';
  const thresholdGap = exam.threshold - summary.average;

  return (
    <>
      <section className="question-panel">
        <p className="question-panel-label">Summary</p>
        <div className="question-panel-body">
          <p className="aio-prose">{linked(content.summary)}</p>
        </div>
        <div className="ca-stats aio-stats">
          <div className="ca-stat">
            <span className="ca-stat-label">Passed</span>
            <strong className="ca-stat-value">{summary.passRate}%</strong>
            <span className="ca-stat-sub">
              {previous ? <><Delta value={previous.passRateChange} /> vs {previous.name}</> : `${summary.passed} of ${plural(summary.takers, 'taker')}`}
            </span>
          </div>
          <div className="ca-stat">
            <span className="ca-stat-label">Average score</span>
            <strong className="ca-stat-value">{summary.average}%</strong>
            <span className="ca-stat-sub">
              {previous
                ? <><Delta value={previous.averageChange} /> vs {previous.name}</>
                : thresholdGap > 0 ? `${thresholdGap} pts below passing` : 'At or above passing'}
            </span>
          </div>
          <div className="ca-stat">
            <span className="ca-stat-label">Within 5 pts of passing</span>
            <strong className="ca-stat-value">{summary.nearMiss}</strong>
            <span className="ca-stat-sub">Scored {groups.nearMiss.from}% to {groups.nearMiss.to}%</span>
          </div>
          <div className="ca-stat">
            <span className="ca-stat-label">Took the exam</span>
            <strong className="ca-stat-value">{summary.takers}</strong>
            <span className="ca-stat-sub">
              {summary.eligible > 0 ? `Of ${summary.eligible} eligible ${audienceNoun}` : `Eligible ${audienceNoun} count unavailable`}
              {summary.missed > 0 && `, including ${summary.missed} who missed it (0%)`}
            </span>
          </div>
        </div>
      </section>

      {content.findings?.length > 0 && (
        <section className="question-panel">
          <p className="question-panel-label">What Stands Out</p>
          <ul className="aio-findings">
            {content.findings.map((finding, index) => {
              const tone = FINDING_TONES[finding.tone] || FINDING_TONES.watch;
              return (
                <li key={index} className="aio-finding">
                  <span className={`aio-finding-icon ${tone.className}`} title={tone.label}>
                    <FindingIcon tone={finding.tone} />
                    <span className="aio-sr">{tone.label}: </span>
                  </span>
                  <div>
                    <p className="aio-finding-text">
                      <span className={`aio-finding-title ${tone.className}`}>{finding.title}</span>
                      {linked(finding.text)}
                    </p>
                    {(finding.questions?.length > 0 || finding.topics?.length > 0) && (
                      <div className="aio-refs">
                        {finding.questions.map((number) => (
                          <button key={`q${number}`} type="button" className="aio-ref" onClick={() => onOpenQuestion(number)} title={`Open Q${number} in the Questions view`}>
                            Q{number}
                          </button>
                        ))}
                        {finding.topics.map((name) => (
                          <button key={`t${name}`} type="button" className="aio-ref aio-ref--topic" onClick={() => onOpenTopic(name)} title={`Show the questions of ${name}`}>
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {topics.length > 0 && (
        <section className="question-panel">
          <p className="question-panel-label aio-label">
            {previous ? `Topics Since ${previous.name}` : 'Scores by Topic'}
            <small>Weakest first</small>
          </p>
          <div className="question-panel-body">
            <TopicChart topics={topics} threshold={exam.threshold} currentLabel={currentLabel} previousLabel={previousLabel} />
          </div>
          {content.topicsNote && <AiNote>{linked(content.topicsNote)}</AiNote>}
          <NumbersTable
            head={previous
              ? [{ label: 'Topic' }, { label: 'Items', num: true }, { label: previous.name, num: true }, { label: 'This exam', num: true }, { label: 'Change', num: true }]
              : [{ label: 'Topic' }, { label: 'Items', num: true }, { label: 'Score', num: true }]}
            rows={topics.map((topic) => (previous
              ? [topic.name, topic.items, topic.previous === null ? '-' : `${topic.previous}%`, `${topic.score}%`, signed(topic.change)]
              : [topic.name, topic.items, `${topic.score}%`]))}
          />
        </section>
      )}

      <section className="question-panel">
        <p className="question-panel-label aio-label">
          Questions to Review
          {content.questionsToReview?.length > 0 && <small>Select a row to open it</small>}
        </p>
        {content.questionsToReview?.length > 0 ? (
          <div className="aio-table-wrap">
            <table className="aio-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th className="is-num">Correct</th>
                  <th>Most-picked wrong answer</th>
                  <th>Why it was flagged</th>
                </tr>
              </thead>
              <tbody>
                {content.questionsToReview.map((entry) => {
                  const question = questionsByNumber.get(entry.question);
                  if (!question) return null;
                  const flag = FLAGS[entry.flag] || FLAGS.shared_mistake;
                  const open = () => onOpenQuestion(entry.question);
                  return (
                    <tr
                      key={entry.question}
                      className="aio-q-row"
                      tabIndex={0}
                      aria-label={`Open Q${entry.question} in the Questions view`}
                      onClick={open}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          open();
                        }
                      }}
                    >
                      <td>
                        <span className="aio-q-num">Q{entry.question}</span>
                        <span className="aio-q-topic">{question.topic}</span>
                      </td>
                      <td className="is-num">
                        <span className="aio-corr">
                          <span className="aio-corr-bar" aria-hidden="true"><i style={{ width: `${question.correct}%` }} /></span>
                          {question.correct}%
                        </span>
                      </td>
                      <td>
                        {question.topWrong
                          ? `Answer ${question.topWrong.answer} · ${question.topWrong.percent}%`
                          : <span className="aio-q-topic">None to speak of</span>}
                        {question.blank > 0 && <span className="aio-q-topic">Left blank · {question.blank}%</span>}
                      </td>
                      <td className="aio-q-why">
                        <span className={`ca-tone-pill ca-tone-pill--${flag.tone}`}>{flag.label}</span>
                        {entry.reason && <span className="aio-q-reason">{entry.reason}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ca-hint ca-hint--section">No question stood out in how it was answered.</p>
        )}
      </section>

      {trend.length >= 2 && (
        <section className="question-panel">
          <p className="question-panel-label aio-label">
            Progress Across Exams
            <small>{exam.program || (isAlumni ? 'Alumni exams' : 'Student exams')}</small>
          </p>
          <div className="question-panel-body">
            <ul className="aio-legend">
              <li><span className="aio-key-line is-1" />Average score</li>
              <li><span className="aio-key-line is-2" />Pass rate</li>
              <li><span className="aio-key-dash" />Passing {exam.threshold}%</li>
            </ul>
            <TrendChart trend={trend} threshold={exam.threshold} />
          </div>
          {content.progressNote && <AiNote>{linked(content.progressNote)}</AiNote>}
          <NumbersTable
            head={[{ label: 'Exam' }, { label: 'Date' }, { label: 'Takers', num: true }, { label: 'Average', num: true }, { label: 'Pass rate', num: true }]}
            rows={trend.map((point) => [
              point.current ? `${point.name} (this exam)` : point.name,
              point.date || '-',
              point.takers,
              `${point.average}%`,
              `${point.passRate}%`,
            ])}
          />
        </section>
      )}

      <section className="question-panel">
        <p className="question-panel-label aio-label">
          Who Needs Support
          <small>Counts only; names stay in Individual</small>
        </p>
        <div className="ca-stats aio-stats aio-stats--groups">
          <div className="ca-stat">
            <span className="ca-stat-label">Within 5 pts of passing</span>
            <strong className="ca-stat-value">{groups.nearMiss.count}</strong>
            <span className="ca-stat-sub">
              Scored {groups.nearMiss.from}% to {groups.nearMiss.to}%
              {groups.nearMiss.weakestTopics?.length > 0 && (
                <>; weakest in {groups.nearMiss.weakestTopics.map((topic) => `${topic.name} (${topic.score}%)`).join(' and ')}</>
              )}
            </span>
            <button type="button" className="aio-link-btn" onClick={() => onOpenIndividual({ takenFilter: 'taken', sortOrder: 'score_desc' })}>
              Open in Individual ›
            </button>
          </div>
          <div className="ca-stat">
            <span className="ca-stat-label">Below {groups.belowFifty.under}%</span>
            <strong className="ca-stat-value">{groups.belowFifty.count}</strong>
            <span className="ca-stat-sub">Far from the passing score</span>
            <button type="button" className="aio-link-btn" onClick={() => onOpenIndividual({ takenFilter: 'taken', sortOrder: 'score_asc' })}>
              Open in Individual ›
            </button>
          </div>
          <div className="ca-stat">
            <span className="ca-stat-label">Didn&apos;t take it</span>
            <strong className="ca-stat-value">{groups.notTaken.count}</strong>
            <span className="ca-stat-sub">
              {summary.eligible > 0 ? `Of ${summary.eligible} eligible ${audienceNoun}` : `Eligible ${audienceNoun}`}
              {summary.missed > 0 && `, including ${summary.missed} who missed it`}
            </span>
            <button type="button" className="aio-link-btn" onClick={() => onOpenIndividual({ takenFilter: 'not_taken', sortOrder: 'name_asc' })}>
              Open in Individual ›
            </button>
          </div>
        </div>
        {content.supportNote && <AiNote>{linked(content.supportNote)}</AiNote>}
      </section>

      {content.nextSteps?.length > 0 && (
        <section className="question-panel">
          <p className="question-panel-label">Suggested Next Steps</p>
          <ol className="aio-steps">
            {content.nextSteps.map((stepText, index) => <li key={index}><span>{linked(stepText)}</span></li>)}
          </ol>
        </section>
      )}

      <section className="question-panel">
        <p className="question-panel-label">About This Overview</p>
        <ul className="aio-about">
          {isAlumni ? (
            <li>
              Based on each alumni&apos;s highest score: {summary.takers} alumni with {plural(facts.basis?.attempts || 0, 'attempt')}
              {facts.basis?.latestAttempt ? `, the latest on ${facts.basis.latestAttempt}` : ''}.
            </li>
          ) : (
            <li>
              Based on the results computed{facts.basis?.computed ? ` on ${facts.basis.computed}` : ''}: {plural(summary.takers, 'taker')}
              {summary.missed > 0 ? `, including ${summary.missed} who missed it and count as 0%, as on the Overall view` : ''}.
            </li>
          )}
          {previous ? (
            <li>
              Compared with {previous.name}{previous.date ? ` (${previous.date})` : ''}, the program&apos;s latest earlier
              {isAlumni ? ' alumni' : ' student'} exam with results.
            </li>
          ) : (
            <li>No earlier {isAlumni ? 'alumni' : 'student'} exam of this program has results, so there is nothing to compare with yet.</li>
          )}
          {summary.takers < 10 && <li>With only {plural(summary.takers, 'taker')}, the figures may not reflect the whole class.</li>}
          {facts.upperLower?.size > 0 && (
            <li>
              The upper and lower groups are the top and bottom {facts.upperLower.share}% of takers ({facts.upperLower.size} each).
            </li>
          )}
          <li>
            Written by AI{overview.model ? ` (${overview.model})` : ''} from the figures above, which were checked against them.
            No names, IDs or question text were sent. Read it before you share it.
          </li>
          {data.versions.length > 1 && <li>{plural(data.versions.length, 'version')} written so far; earlier ones stay in the version list.</li>}
        </ul>
      </section>
    </>
  );
}

/**
 * ai is useExamAiOverview's value. takers and questionCount describe the results while it
 * generates. onGenerate starts a generation (or asks first); onOpenQuestion(number),
 * onOpenTopic(name) and onOpenIndividual({ takenFilter, sortOrder }) switch the panel's view.
 */
export default function AiOverviewView({
  ai,
  takers,
  questionCount,
  onGenerate,
  onOpenQuestion,
  onOpenTopic,
  onOpenIndividual,
}) {
  const { data, loading, error, isGenerating, generateError } = ai;

  if (!data) {
    if (error) {
      return (
        <div className="ca-retry">
          <p className="ca-panel-note ca-panel-note--error" role="alert">{error}</p>
          <button type="button" className="ca-btn ca-btn--plain" onClick={ai.reload}>Try again</button>
        </div>
      );
    }
    return <p className="ca-panel-note">{loading ? 'Loading the AI overview...' : ''}</p>;
  }

  const { limit, remaining, versions, overview } = data;
  const generatingBy = data.generating?.createdBy?.name || null;

  const canRetry = generateError && generateError.code !== 'limit' && remaining > 0;
  // The server's message, its first sentence in bold
  const errorText = generateError?.message || '';
  const sentenceEnd = errorText.indexOf('. ');
  const firstSentence = sentenceEnd >= 0 ? errorText.slice(0, sentenceEnd + 1) : errorText;
  const restOfMessage = sentenceEnd >= 0 ? errorText.slice(sentenceEnd + 1) : '';
  const failedBanner = generateError && (
    <Banner
      tone={generateError.code === 'limit' ? 'muted' : 'bad'}
      icon={<AlertIcon />}
      action={canRetry && (
        <button type="button" className="aio-btn aio-btn--primary" onClick={onGenerate}>Try again</button>
      )}
    >
      <strong>{firstSentence}</strong>{restOfMessage}
    </Banner>
  );

  if (isGenerating) {
    return <GeneratingCard takers={takers} questionCount={questionCount} startedBy={generatingBy} />;
  }

  if (!overview) {
    return (
      <>
        {failedBanner}
        <EmptyState limit={limit} remaining={remaining} onGenerate={onGenerate} />
      </>
    );
  }

  const latestVersion = versions[0]?.version;
  const author = overview.createdBy;
  const isAlumni = overview.facts?.exam?.audience === 'alumni';

  return (
    <div className={`aio-view ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
      <div className="aio-meta">
        <span className="aio-badge"><SparkleIcon />AI Overview</span>
        <span className="aio-meta-grow">
          Generated {formatDateTime(overview.createdAt)}
          {author && <> by <strong>{author.name}</strong>{ROLE_LABELS[author.role] ? ` (${ROLE_LABELS[author.role]})` : ''}</>}
        </span>
        {versions.length > 1 ? (
          <DropdownSelect
            className="aio-version"
            value={String(overview.version)}
            onChange={(event) => ai.selectVersion(Number(event.target.value))}
            ariaLabel="Version of the overview"
            options={versions.map((entry) => ({
              value: String(entry.version),
              label: `Version ${entry.version} · ${formatDate(entry.createdAt)}${entry.version === latestVersion ? ' (latest)' : ''}`,
            }))}
          />
        ) : (
          <span className="aio-version-one">Version {overview.version}</span>
        )}
        <Quota limit={limit} remaining={remaining} />
        <p className="aio-meta-note">The numbers, charts and tables come straight from the results. The AI wrote the words around them.</p>
      </div>

      {failedBanner}

      {!overview.isLatest && (
        <Banner tone="muted" icon={<HistoryIcon />} action={(
          <button type="button" className="aio-btn aio-btn--plain" onClick={() => ai.selectVersion(null)}>Show the latest</button>
        )}>
          <strong>You are reading version {overview.version}.</strong> The latest is version {latestVersion}.
        </Banner>
      )}

      {overview.isStale && overview.isLatest && (
        <Banner icon={<ClockIcon />} action={remaining > 0 && (
          <button type="button" className="aio-btn aio-btn--plain" onClick={onGenerate}>Regenerate</button>
        )}>
          <strong>Out of date.</strong>{' '}
          {isAlumni
            ? `${plural(overview.newAttempts, 'new attempt')} came in after this overview was written.`
            : 'The results were computed again after this overview was written.'}
          {remaining > 0 ? ' Regenerate it to include the changes.' : ''}
        </Banner>
      )}

      {remaining === 0 && (
        <Banner tone="muted" icon={<StopIcon />}>
          <strong>All {limit} generations for this exam are used.</strong> You can still read every version from the list above.
        </Banner>
      )}

      <OverviewBody
        overview={overview}
        data={data}
        onOpenQuestion={onOpenQuestion}
        onOpenTopic={onOpenTopic}
        onOpenIndividual={onOpenIndividual}
      />
    </div>
  );
}
