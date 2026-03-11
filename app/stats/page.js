'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import SessionDetailModal from '@/components/SessionDetailModal';
import { getStats, getCompanies, getPayEstimate } from '@/lib/store';
import { formatDurationShort, formatTime } from '@/lib/utils';

// Rich tooltip component — appears instantly on hover
function BarTooltip({ data, position }) {
    if (!data) return null;
    return (
        <div
            className="bar-tooltip"
            style={{
                position: 'fixed',
                left: position.x + 16,
                top: position.y,
                transform: 'translateY(-50%)',
                zIndex: 1000,
                pointerEvents: 'none',
            }}
        >
            <div className="bar-tooltip-header">
                <span className="bar-tooltip-dot" style={{ backgroundColor: data.color }} />
                <strong>{data.companyName}</strong>
            </div>
            <div className="bar-tooltip-stat">
                <span>Total</span>
                <span className="bar-tooltip-value">{formatDurationShort(data.totalSeconds)}</span>
            </div>
            {data.sessionCount > 0 && (
                <div className="bar-tooltip-stat">
                    <span>Sessions</span>
                    <span>{data.sessionCount}</span>
                </div>
            )}
            {data.timeRange && (
                <div className="bar-tooltip-stat">
                    <span>Time</span>
                    <span>{data.timeRange}</span>
                </div>
            )}
            {data.tasks && data.tasks.length > 0 && (
                <div className="bar-tooltip-tasks">
                    {data.tasks.slice(0, 3).map((t, i) => (
                        <div key={i} className="bar-tooltip-task">
                            <span className="bar-tooltip-task-name">{t.name}</span>
                            <span className="bar-tooltip-task-dur">{formatDurationShort(t.duration)}</span>
                        </div>
                    ))}
                    {data.tasks.length > 3 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            +{data.tasks.length - 3} more...
                        </div>
                    )}
                </div>
            )}
            {data.summary && (
                <div className="bar-tooltip-summary">{data.summary}</div>
            )}
            <div className="bar-tooltip-hint">Click for details</div>
        </div>
    );
}

export default function StatsPage() {
    const [sessions, setSessions] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [payEstimates, setPayEstimates] = useState([]);
    const [dateRange, setDateRange] = useState('week');
    const [loading, setLoading] = useState(true);
    const [selectedSession, setSelectedSession] = useState(null);
    const [tooltip, setTooltip] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    const loadStats = useCallback(async () => {
        setLoading(true);
        try {
            const [data, comps] = await Promise.all([getStats(dateRange), getCompanies()]);
            setSessions(data);
            setCompanies(comps);

            const physicalCompanies = comps.filter(c => c.company_type === 'physical' && c.pay_rate);
            const estimates = await Promise.all(
                physicalCompanies.map(c => getPayEstimate(c.id).catch(() => null))
            );
            setPayEstimates(estimates.filter(Boolean));
        } catch (err) {
            console.error('Failed to load stats', err);
        }
        setLoading(false);
    }, [dateRange]);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    // Build tooltip data for a company on a specific day
    const getTooltipData = (companyName, dayIndex) => {
        const daySessions = dayIndex !== undefined
            ? sessions.filter(s => (s.companies?.name || 'Unknown') === companyName && new Date(s.start_time).getDay() === dayIndex)
            : sessions.filter(s => (s.companies?.name || 'Unknown') === companyName);

        if (daySessions.length === 0) return null;

        const totalSeconds = daySessions.reduce((sum, s) => sum + (s.duration || 0), 0);
        const color = daySessions[0]?.companies?.color || '#6366f1';

        // Time range
        const sorted = [...daySessions].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        const earliest = sorted[0];
        const latest = sorted[sorted.length - 1];
        const timeRange = earliest && latest?.end_time
            ? `${formatTime(earliest.start_time)} — ${formatTime(latest.end_time)}`
            : earliest ? `${formatTime(earliest.start_time)}` : null;

        // Task breakdown
        const taskMap = {};
        daySessions.forEach(s => {
            const taskName = s.tasks?.name || s.projects?.name || 'Work';
            if (!taskMap[taskName]) taskMap[taskName] = 0;
            taskMap[taskName] += s.duration || 0;
        });
        const tasks = Object.entries(taskMap)
            .map(([name, duration]) => ({ name, duration }))
            .sort((a, b) => b.duration - a.duration);

        // Summary — use the first AI summary or user summary we find
        const summarySession = daySessions.find(s => s.ai_summary) || daySessions.find(s => s.summary);
        const summary = summarySession?.ai_summary || summarySession?.summary || null;
        const truncatedSummary = summary && summary.length > 100 ? summary.slice(0, 100) + '...' : summary;

        return {
            companyName,
            color,
            totalSeconds,
            sessionCount: daySessions.length,
            timeRange,
            tasks,
            summary: truncatedSummary,
        };
    };

    const handleBarHover = (e, companyName, dayIndex) => {
        const data = getTooltipData(companyName, dayIndex);
        if (data) {
            setTooltip(data);
            setTooltipPos({ x: e.clientX, y: e.clientY });
        }
    };

    const handleBarMove = (e) => {
        setTooltipPos({ x: e.clientX, y: e.clientY });
    };

    const handleBarLeave = () => {
        setTooltip(null);
    };

    // Calculate stats
    const totalSeconds = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalSessions = sessions.length;
    const avgSessionSeconds = totalSessions > 0 ? Math.round(totalSeconds / totalSessions) : 0;

    const companyHours = {};
    const companyColors = {};
    sessions.forEach((s) => {
        const name = s.companies?.name || 'Unknown';
        companyHours[name] = (companyHours[name] || 0) + (s.duration || 0);
        companyColors[name] = s.companies?.color || '#6366f1';
    });
    const maxHours = Math.max(...Object.values(companyHours), 1);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayHours = [0, 0, 0, 0, 0, 0, 0];
    const dayCompanyHours = [{}, {}, {}, {}, {}, {}, {}];
    sessions.forEach((s) => {
        const day = new Date(s.start_time).getDay();
        const companyName = s.companies?.name || 'Unknown';
        const companyColor = s.companies?.color || '#6366f1';
        dayHours[day] += s.duration || 0;
        if (!dayCompanyHours[day][companyName]) {
            dayCompanyHours[day][companyName] = { seconds: 0, color: companyColor };
        }
        dayCompanyHours[day][companyName].seconds += s.duration || 0;
    });
    const maxDayHours = Math.max(...dayHours, 1);

    const mostProductiveDay = dayHours.indexOf(Math.max(...dayHours));
    const longestSession = sessions.reduce((max, s) => (s.duration || 0) > (max?.duration || 0) ? s : max, null);

    if (loading) {
        return (
            <AppLayout>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <div className="loading-spinner" />
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="page-header flex justify-between items-center">
                <div>
                    <h2>Stats</h2>
                    <p>Your productivity at a glance</p>
                </div>
                <div className="filter-bar" style={{ marginBottom: 0 }}>
                    {['today', 'week', 'month', 'all'].map((range) => (
                        <button
                            key={range}
                            className={`btn ${dateRange === range ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                            onClick={() => setDateRange(range)}
                        >
                            {range.charAt(0).toUpperCase() + range.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Overview Stats */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Time</div>
                    <div className="stat-value">{formatDurationShort(totalSeconds)}</div>
                    <div className="stat-sub">{(totalSeconds / 3600).toFixed(1)} hours</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Sessions</div>
                    <div className="stat-value">{totalSessions}</div>
                    <div className="stat-sub">work sessions</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Avg Session</div>
                    <div className="stat-value">{formatDurationShort(avgSessionSeconds)}</div>
                    <div className="stat-sub">per session</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Most Productive</div>
                    <div className="stat-value">{dayNames[mostProductiveDay]}</div>
                    <div className="stat-sub">{formatDurationShort(dayHours[mostProductiveDay])}</div>
                </div>
            </div>

            {/* Paycheck Estimates */}
            {payEstimates.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Icon name="dollar" size={18} style={{ color: 'var(--color-success)' }} /> Paycheck Estimates
                    </h3>
                    {payEstimates.map((est, i) => (
                        <div key={i} className="paycheck-card">
                            <div className="paycheck-company">
                                <div className="paycheck-company-dot" style={{ backgroundColor: est.companyColor }} />
                                <span className="paycheck-company-name">{est.companyName}</span>
                                <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {est.payPeriod} • {est.daysUntilPayday}d until payday
                                </span>
                            </div>
                            <div className="paycheck-grid">
                                <div className="paycheck-stat">
                                    <div className="paycheck-stat-label">Hours Worked</div>
                                    <div className="paycheck-stat-value">{est.totalHours}h</div>
                                </div>
                                <div className="paycheck-stat">
                                    <div className="paycheck-stat-label">Rate</div>
                                    <div className="paycheck-stat-value">${est.payRate.toFixed(2)}/hr</div>
                                </div>
                                <div className="paycheck-stat">
                                    <div className="paycheck-stat-label">Gross Pay</div>
                                    <div className="paycheck-stat-value">${est.grossPay.toFixed(2)}</div>
                                </div>
                                <div className="paycheck-stat">
                                    <div className="paycheck-stat-label">Taxes (Fed + State + FICA)</div>
                                    <div className="paycheck-stat-value tax">-${est.totalTax.toFixed(2)}</div>
                                </div>
                                <div className="paycheck-stat full-width">
                                    <div className="paycheck-stat-label">Estimated Take-Home</div>
                                    <div className="paycheck-stat-value net">${est.netPay.toFixed(2)}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Company Breakdown */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '20px' }}>Hours by Company</h3>
                {Object.keys(companyHours).length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>
                        No data for this period
                    </div>
                ) : (
                    <div className="bar-chart">
                        {Object.entries(companyHours).map(([name, seconds]) => {
                            const percentage = (seconds / maxHours) * 100;
                            return (
                                <div key={name} className="bar-chart-item">
                                    <div className="bar-chart-value">{formatDurationShort(seconds)}</div>
                                    <div
                                        className="bar-chart-bar clickable"
                                        style={{
                                            height: `${Math.max(percentage, 3)}%`,
                                            backgroundColor: companyColors[name],
                                        }}
                                        onMouseEnter={(e) => handleBarHover(e, name)}
                                        onMouseMove={handleBarMove}
                                        onMouseLeave={handleBarLeave}
                                        onClick={() => {
                                            const sess = sessions.find(s => s.companies?.name === name);
                                            if (sess) setSelectedSession(sess);
                                        }}
                                    />
                                    <div className="bar-chart-label">{name}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Day of Week Distribution — STACKED */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '20px' }}>By Day of Week</h3>
                <div className="bar-chart">
                    {dayNames.map((day, i) => {
                        const totalPerc = (dayHours[i] / maxDayHours) * 100;
                        const companyEntries = Object.entries(dayCompanyHours[i]);
                        const hasData = dayHours[i] > 0;

                        return (
                            <div key={day} className="bar-chart-item">
                                <div className="bar-chart-value">{hasData ? formatDurationShort(dayHours[i]) : ''}</div>
                                {hasData && companyEntries.length > 1 ? (
                                    <div
                                        style={{
                                            height: `${Math.max(totalPerc, 5)}%`,
                                            width: '100%',
                                            maxWidth: '60px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        {companyEntries.map(([name, data]) => (
                                            <div
                                                key={name}
                                                style={{
                                                    flexGrow: data.seconds,
                                                    backgroundColor: data.color,
                                                    minHeight: '3px',
                                                    cursor: 'pointer',
                                                    transition: 'filter 0.15s ease',
                                                }}
                                                onMouseEnter={(e) => handleBarHover(e, name, i)}
                                                onMouseMove={handleBarMove}
                                                onMouseLeave={handleBarLeave}
                                                onClick={() => {
                                                    const sess = sessions.find(s => s.companies?.name === name && new Date(s.start_time).getDay() === i);
                                                    if (sess) setSelectedSession(sess);
                                                }}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div
                                        className="bar-chart-bar clickable"
                                        style={{
                                            height: `${Math.max(totalPerc, 3)}%`,
                                            background: hasData
                                                ? (companyEntries[0]?.[1]?.color || 'var(--gradient-accent)')
                                                : 'var(--bg-elevated)',
                                        }}
                                        onMouseEnter={(e) => {
                                            if (hasData && companyEntries[0]) handleBarHover(e, companyEntries[0][0], i);
                                        }}
                                        onMouseMove={handleBarMove}
                                        onMouseLeave={handleBarLeave}
                                        onClick={() => {
                                            if (hasData) {
                                                const sess = sessions.find(s => new Date(s.start_time).getDay() === i);
                                                if (sess) setSelectedSession(sess);
                                            }
                                        }}
                                    />
                                )}
                                <div className="bar-chart-label">{day}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Longest Session */}
            {longestSession && (
                <div
                    className="card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedSession(longestSession)}
                >
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Icon name="trophy" size={18} style={{ color: 'var(--color-warning)' }} /> Longest Session
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="session-color" style={{ backgroundColor: longestSession.companies?.color || '#6366f1' }} />
                        <div>
                            <div style={{ fontWeight: 600 }}>{longestSession.tasks?.name || 'Unknown'}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {longestSession.companies?.name} — {new Date(longestSession.start_time).toLocaleDateString()}
                            </div>
                        </div>
                        <div style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-accent)' }}>
                            {formatDurationShort(longestSession.duration)}
                        </div>
                    </div>
                </div>
            )}

            {/* Tooltip */}
            <BarTooltip data={tooltip} position={tooltipPos} />

            {/* Session Detail Modal */}
            {selectedSession && (
                <SessionDetailModal
                    session={selectedSession}
                    onClose={() => setSelectedSession(null)}
                    onSaved={() => {
                        setSelectedSession(null);
                        loadStats();
                    }}
                />
            )}
        </AppLayout>
    );
}
