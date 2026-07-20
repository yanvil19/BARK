import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    Tooltip,
    Legend
} from 'chart.js';

import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    Tooltip,
    Legend
);

import React, { useState, useEffect } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/alumni/AlumniDashboard.css';
import '../../styles/global.css';
import PageHeader from '../../components/PageHeader.jsx';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function isReleased(attempt) {
    if (attempt?.resultsReleased === true) return true;
    if (attempt?.resultsReleased === false) return false;
    if (attempt?.rawScore != null && attempt?.totalScore != null) return true;
    if (!attempt?.resultReleasedAt) return false;
    return new Date() >= new Date(attempt.resultReleasedAt);
}

function formatDate(date) {
    return new Date(date).toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatReleaseDate(date) {
    if (!date) return 'TBA';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'TBA';

    return d.toLocaleString('en-PH', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

function formatDuration(minutes) {
    if (!minutes) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function getStatusMeta(status) {
    switch (status) {
        case 'passed': return { label: 'Passed', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', padding: '4px 8px' };
        case 'near_pass': return { label: 'Near pass', color: '#d97706', bg: '#fffbeb', border: '#fde68a', padding: '4px 8px' };
        case 'failed': return { label: 'Failed', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', padding: '3px 10px', borderRadius: '9999px', marginTop: '0.5em' };
        default: return null;
    }
}

function getBarColor(pct) {
    if (pct >= 75) return '#16a34a';
    if (pct >= 50) return '#d97706';
    return '#dc2626';
}

// ─── COUNTDOWN HOOK ───────────────────────────────────────────────────────────

function useCountdown(targetDate) {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        if (!targetDate) {
            setTimeLeft('TBA');
            return;
        }

        function compute() {
            const diff = new Date(targetDate) - new Date();
            if (diff <= 0) { setTimeLeft(''); return; }
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            if (days > 0) setTimeLeft(`${days}d ${hours}h ${mins}m`);
            else if (hours > 0) setTimeLeft(`${hours}h ${mins}m ${secs}s`);
            else setTimeLeft(`${mins}m ${secs}s`);
        }
        compute();
        const id = setInterval(compute, 1000);
        return () => clearInterval(id);
    }, [targetDate]);

    return timeLeft;
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function StatCard({ accentColor, bigLabel, subLabel, subtitle, className = "", subtitleClass = "" }) {
    return (
        <div className={`sd-stat-card ${className}`} style={{ '--sd-accent': accentColor }}>
            <div className="sd-stat-top-bar" />
            <div className="sd-stat-body">
                <div className="sd-stat-big">{bigLabel}</div>
                <div className="sd-stat-label">{subLabel}</div>
                {subtitle && <div className="sd-stat-subtitle">{subtitle}</div>}
            </div>
        </div>
    );
}

function AttemptRow({ attempt, isSelected, onClick }) {
    const released = isReleased(attempt);
    const statusMeta = released ? getStatusMeta(attempt.status) : null;
    const countdown = useCountdown(attempt.resultReleasedAt);
    const duration = formatDuration(attempt.durationMinutes);
    const isClickable = released;

    return (
        <div
            className={[
                'sd-attempt-row',
                !released ? 'sd-attempt-row--pending' : '',
                isSelected ? 'sd-attempt-row--selected' : '',
                isClickable ? 'sd-attempt-row--clickable' : '',
            ].filter(Boolean).join(' ')}
            onClick={isClickable ? onClick : undefined}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={isClickable ? (e => e.key === 'Enter' && onClick?.()) : undefined}
        >
            {/* Timeline dot */}
            <div className="sd-attempt-dot-col">
                <span className={`sd-dot${!released ? ' sd-dot--muted' : ''}${isSelected ? ' sd-dot--active' : ''}`} />
            </div>

            {/* Left: date + exam info */}
            <div className="sd-attempt-left">
                <div className="sd-attempt-name">
                    {attempt.examName}
                </div>

                <div className="sd-attempt-date">
                    {formatDate(attempt.date)}
                </div>

                <div className="sd-attempt-meta">
                    {attempt.totalItems} items
                    {duration && ` · ${duration}`}
                </div>

                {!released && (
                    <div className="sd-attempt-status">
                        <span className="sd-pending-badge">
                            Pending release
                        </span>
                    </div>
                )}

            </div>


            {/* Right: score or countdown */}
            <div className="sd-attempt-right">
                {released ? (
                    <>
                        <div className="sd-score">
                            {attempt.rawScore}
                            <span className="sd-score-denom">/{attempt.totalScore}</span>
                        </div>
                        {statusMeta && (
                            <span
                                className="sd-status-badge"
                                style={{
                                    color: statusMeta.color,
                                    background: statusMeta.bg,
                                    border: `1px solid ${statusMeta.border}`,
                                    padding: statusMeta.padding,
                                    borderRadius: statusMeta.borderRadius || '9999px',
                                    marginTop: statusMeta.marginTop || '0',
                                }}
                            >
                                {statusMeta.label}
                            </span>
                        )}
                    </>
                ) : (

                    <div className="sd-release-teaser">
                        <div className="sd-release-label">Results release in:</div>

                        {attempt.resultReleasedAt ? (
                            <>
                                <div className="sd-release-countdown">
                                    {countdown || '—'}
                                </div>
                                <div className="sd-release-on">
                                    {formatReleaseDate(attempt.resultReleasedAt)}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="sd-release-countdown">Countdown: TBA</div>
                                <div className="sd-release-on">Date and Time: TBA</div>
                            </>
                        )}
                    </div>

                )}
            </div>
        </div>
    );
}

function SubjectBar({ subject }) {
    const pct = Math.round((subject.correct / subject.total) * 100);
    const color = getBarColor(pct);

    return (
        <div className="sd-subject-row">
            <div className="sd-subject-name">{subject.name}</div>
            <div className="sd-subject-bar-track">
                <div
                    className="sd-subject-bar-fill"
                    style={{ width: `${pct}%`, background: color }}
                />
            </div>
            <div className="sd-subject-pct" style={{ color }}>{pct}%</div>
            <div className="sd-subject-fraction">{subject.correct}/{subject.total}</div>
        </div>
    );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const AlumniDashboard = ({ me, onNavigate }) => {
    const [attempts, setAttempts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedAttempt, setSelectedAttempt] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 5;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

    useEffect(() => {
        async function fetchAttempts() {
            setLoading(true);
            try {
                const data = await apiAuth(`${BASE}/api/alumni-exams/my-attempts`);
                const sorted = (data.attempts || [])
                    .filter((attempt) => attempt.examName && attempt.examName !== 'Unknown Exam')
                    .sort((a, b) => new Date(b.date) - new Date(a.date));
                setAttempts(sorted);

                // Default selection: latest with subject scores
                const released = sorted.filter(isReleased);
                const defaultSelected = released.find(a => a.subjectScores?.length > 0) ?? null;
                setSelectedAttempt(defaultSelected);
            } catch (err) {
                console.error('Failed to load attempts:', err);
                setError(err.message || 'Failed to load dashboard data.');
            } finally {
                setLoading(false);
            }
        }
        fetchAttempts();
    }, []);

    const releasedAttempts = attempts;
    const totalTaken = attempts.length;
    const passed = releasedAttempts.filter(a => a.status === 'passed').length;
    const toImprove = releasedAttempts.filter(a => a.status !== 'passed').length;

    const scoredAttempts = releasedAttempts.filter(
        a => a.rawScore != null && a.totalScore && a.totalScore > 0
    );

    const totalEarned = scoredAttempts.reduce(
        (sum, a) => sum + a.rawScore,
        0
    );

    const totalPossible = scoredAttempts.reduce(
        (sum, a) => sum + a.totalScore,
        0
    );

    const overallScore =
        totalPossible > 0 ? `${totalEarned}/${totalPossible}` : '—';

    const highestAttempt = scoredAttempts.length
        ? scoredAttempts.reduce((prev, curr) =>
            (curr.rawScore / curr.totalScore) >
                (prev.rawScore / prev.totalScore)
                ? curr
                : prev
        )
        : null;

    const lowestAttempt = scoredAttempts.length
        ? scoredAttempts.reduce((prev, curr) =>
            (curr.rawScore / curr.totalScore) <
                (prev.rawScore / prev.totalScore)
                ? curr
                : prev
        )
        : null;

    // SUBJECT MASTERY
    const subjectTotals = {};

    releasedAttempts.forEach(attempt => {
        (attempt.subjectScores || []).forEach(subject => {
            if (!subjectTotals[subject.name]) {
                subjectTotals[subject.name] = {
                    name: subject.name,
                    correct: 0,
                    total: 0,
                };
            }

            subjectTotals[subject.name].correct += subject.correct;
            subjectTotals[subject.name].total += subject.total;
        });
    });

    const masterySubjects = Object.values(subjectTotals)
        .map(subject => ({
            ...subject,
            percentage:
                subject.total > 0
                    ? Math.round((subject.correct / subject.total) * 100)
                    : 0,
        }))
        .sort((a, b) => b.percentage - a.percentage);

    const topSubjects = masterySubjects.slice(0, 5);

    const masteryChartData = {
        labels: topSubjects.map(subject => subject.name),
        datasets: [
            {
                label: 'Mastery %',
                data: topSubjects.map(subject => subject.percentage),
                backgroundColor: topSubjects.map(subject => {
                    if (subject.percentage >= 80) return '#16a34a';
                    if (subject.percentage >= 70) return '#d97706';
                    return '#dc2626';
                }),
                borderRadius: 8,
                barThickness: 18,
            },
        ],
    };

    const bestSubject =
        masterySubjects.length > 0 ? masterySubjects[0] : null;

    const weakestSubject =
        masterySubjects.length > 0
            ? masterySubjects[masterySubjects.length - 1]
            : null;

    const highestScorePct = highestAttempt
        ? Math.round(
            (highestAttempt.rawScore / highestAttempt.totalScore) * 100
        )
        : 0;

    const lowestScorePct = lowestAttempt
        ? Math.round(
            (lowestAttempt.rawScore / lowestAttempt.totalScore) * 100
        )
        : 0;

    // Pagination logic
    const totalPages = Math.ceil(attempts.length / pageSize);
    const paginatedAttempts = attempts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const firstName = me?.firstName || me?.name?.split(' ')[0] || 'Student';

    if (loading) return <div className="sd-loading">Loading dashboard...</div>;
    if (error) return <div className="sd-error">{error}</div>;

    const chartData = {
        labels: ['Total Exams', 'Passed', 'To Improve'],
        datasets: [
            {
                label: 'Statistics',
                data: [
                    totalTaken,
                    passed,
                    toImprove,
                ],
                backgroundColor: [
                    '#35408E', // total
                    '#16a34a', // passed
                    '#dc2626', // improve
                ],
                borderRadius: 6,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        if (context.dataIndex === 3) {
                            return `Score: ${totalEarned}/${totalPossible}`;
                        }
                        return `Value: ${context.raw}`;
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
            },
        },
    };

    const donutData = {
        labels: ['Correct', 'Incorrect'],
        datasets: [
            {
                data: [totalEarned, totalPossible - totalEarned],
                backgroundColor: ['#16a34a', '#d97706'],
                borderWidth: 0
            },
        ],
    };

    const donutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        const label = context.label || '';
                        const value = context.raw;
                        return `${label}: ${value}/${totalPossible}`;
                    },
                },
            },
        },
    };

    const masteryChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',

        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                callbacks: {
                    label: (context) =>
                        `${context.raw}% Mastery`,
                },
            },
        },

        scales: {
            x: {
                beginAtZero: true,
                max: 100,
                ticks: {
                    callback: value => `${value}%`,
                },
            },

            y: {
                ticks: {
                    color: '#35408e',
                    font: {
                        size: 11,
                        weight: '600',
                    },
                },
            },
        },
    };

    // Center text plugin
    const centerTextPlugin = {
        id: 'centerText',
        beforeDraw(chart) {
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2;
            const pct = totalPossible > 0
                ? Math.round((totalEarned / totalPossible) * 100)
                : 0;

            ctx.save();
            ctx.font = `bold 22px var(--font-title)`;
            ctx.fillStyle = '#2b3980';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${pct}%`, centerX, centerY - 8);

            ctx.font = `12px var(--font-body)`;
            ctx.fillStyle = '#8b96c8';
            ctx.fillText('Overall', centerX, centerY + 14);
            ctx.restore();
        },
    };



    return (
        <main className="s-dashboard-container">

            {/* ── HEADER ─────────────────────────────────────────────── */}
            <PageHeader
                className="shared-page-header--bleed-lr"
                title={`${greeting}, ${me?.firstName || 'Alumni'}`}
                subtitle={`${me?.program?.name || 'Program not assigned'} • ${me?.department?.name || 'Department'}`}
            />

            <div className="sd-body">

                <div className="sd-grid">

                    {/* 0 — Personal Thresholds */}
                    <div className="sd-grid-item sd-grid-item-0">
                        <div className="sd-card">
                            <div className="sd-card-header">
                                <span className="sd-card-title">
                                    Personal Thresholds
                                </span>
                            </div>

                            <div className="alumni-thresholds">

                                <div className="threshold-item">
                                    <span className="threshold-label positive">
                                        <strong>Highest Overall Score:</strong>
                                    </span>
                                    <span>{highestScorePct}%</span>
                                </div>

                                <div className="threshold-item">
                                    <span className="threshold-label negative">
                                        <strong style={{ color: "inherit", fontWeight: 600 }}>Lowest Overall Score:</strong>
                                    </span>
                                    <span>{lowestScorePct}%</span>
                                </div>

                                <div className="threshold-item">
                                    {/* Add more threshold items here if needed; for space */}
                                </div>

                                <div className="threshold-item">
                                    <span className="threshold-label">
                                        <strong>Best Subject:</strong>
                                    </span>
                                    <span>
                                        {bestSubject
                                            ? `${bestSubject.name} (${bestSubject.percentage}%)`
                                            : "N/A"}
                                    </span>
                                </div>

                                <div className="threshold-item">
                                    <span className="threshold-label">
                                        <strong>Weakest Subject:</strong>
                                    </span>
                                    <span className="threshold-value">
                                        {weakestSubject
                                            ? `${weakestSubject.name} (${weakestSubject.percentage}%)`
                                            : "N/A"}
                                    </span>
                                </div>

                            </div>
                        </div>
                    </div>

                    {/* 1 — Statistics Chart */}
                    <div className="sd-grid-item sd-grid-item-1-4">
                        <div className="sd-card">
                            <div className="sd-card-header">
                                <span className="sd-card-title">Performance Overview</span>
                            </div>

                            <div className="sd-card-body chart-container">
                                <Bar data={chartData} options={chartOptions} />
                            </div>
                        </div>
                    </div>

                    {/* Subject Mastery */}
                    <div className="sd-grid-item sd-grid-item-2">
                        <div className="sd-card">

                            <div className="sd-card-header">
                                <span className="sd-card-title">
                                    Subject Mastery
                                </span>
                            </div>

                            <div className="mastery-chart-container">

  {masterySubjects.length === 0 ? (
    <div className="sd-empty-state">
      <p className="sd-empty-text">
        No subject data yet.
      </p>
    </div>
  ) : (
    <Bar
      data={masteryChartData}
      options={masteryChartOptions}
    />
  )}

</div>
                        </div>
                    </div>

                    {/* 5 — Chronological Log */}
                    <div className="sd-grid-item sd-grid-item-5">
                        <div className="sd-card sd-card-chrono">
                            <div className="sd-card-header chrono-header">
                                <span className="sd-card-title chrono-title">
                                    Chronological log of all attempts
                                </span>
                            </div>

                            <div className="sd-card-body sd-timeline-chrono">
                                {attempts.length === 0 ? (
                                    <p className="sd-empty">No attempts yet.</p>
                                ) : (
                                    <>
                                        <div className="sd-timeline-wrapper">
                                            <div className="sd-timeline">
                                                {paginatedAttempts.map(a => (
                                                    <AttemptRow
                                                        key={a.id}
                                                        attempt={a}
                                                        isSelected={selectedAttempt?.id === a.id}
                                                        onClick={() => setSelectedAttempt(a)}
                                                    />
                                                ))}
                                            </div>
                                        </div>

                                        {totalPages > 1 && (
                                            <div className="sd-pagination">
                                                <button
                                                    className="sd-pag-btn"
                                                    disabled={currentPage === 1}
                                                    onClick={() => setCurrentPage(p => p - 1)}
                                                >
                                                    Previous
                                                </button>

                                                <span className="sd-pag-info">
                                                    Page {currentPage} of {totalPages}
                                                </span>

                                                <button
                                                    className="sd-pag-btn"
                                                    disabled={currentPage === totalPages}
                                                    onClick={() => setCurrentPage(p => p + 1)}
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </main>
    );
};

export default AlumniDashboard;
