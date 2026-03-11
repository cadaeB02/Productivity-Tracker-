'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import SessionDetailModal from '@/components/SessionDetailModal';
import { getStats, getCompanies, getPayEstimate } from '@/lib/store';
import { formatDurationShort } from '@/lib/utils';

export default function StatsPage() {
    const [sessions, setSessions] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [payEstimates, setPayEstimates] = useState([]);
    const [dateRange, setDateRange] = useState('week');
    const [loading, setLoading] = useState(true);
    const [selectedSession, setSelectedSession] = useState(null);

    const loadStats = useCallback(async () => {
        setLoading(true);
        try {
            const [data, comps] = await Promise.all([getStats(dateRange), getCompanies()]);
            setSessions(data);
            setCompanies(comps);

            // Load pay estimates for companies with pay rates
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

    // Calculate stats
    const totalSeconds = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalSessions = sessions.length;
    const avgSessionSeconds = totalSessions > 0 ? Math.round(totalSeconds / totalSessions) : 0;

    // Hours by company
    const companyHours = {};
    const companyColors = {};
    sessions.forEach((s) => {
        const name = s.companies?.name || 'Unknown';
        companyHours[name] = (companyHours[name] || 0) + (s.duration || 0);
        companyColors[name] = s.companies?.color || '#6366f1';
    });

    const maxHours = Math.max(...Object.values(companyHours), 1);

    // Stacked hours by day of week
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayHours = [0, 0, 0, 0, 0, 0, 0];
    const dayCompanyHours = [{}, {}, {}, {}, {}, {}, {}]; // per-day per-company breakdown
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

    // Most productive day
    const mostProductiveDay = dayHours.indexOf(Math.max(...dayHours));

    // Longest session
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
                                        onClick={() => {
                                            // Find a session from this company to show
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
                                    /* Stacked bar */
                                    <div className="stacked-bar" style={{ height: `${Math.max(totalPerc, 3)}%` }}>
                                        {companyEntries.map(([name, data]) => {
                                            const segHeight = dayHours[i] > 0 ? (data.seconds / dayHours[i]) * 100 : 0;
                                            return (
                                                <div
                                                    key={name}
                                                    className="stacked-bar-segment"
                                                    style={{
                                                        height: `${segHeight}%`,
                                                        backgroundColor: data.color,
                                                    }}
                                                    data-tooltip={`${name}: ${formatDurationShort(data.seconds)}`}
                                                    onClick={() => {
                                                        const sess = sessions.find(s => s.companies?.name === name && new Date(s.start_time).getDay() === i);
                                                        if (sess) setSelectedSession(sess);
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                ) : (
                                    /* Single bar */
                                    <div
                                        className="bar-chart-bar clickable"
                                        style={{
                                            height: `${Math.max(totalPerc, 3)}%`,
                                            background: hasData
                                                ? (companyEntries[0]?.[1]?.color || 'var(--gradient-accent)')
                                                : 'var(--bg-elevated)',
                                        }}
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
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}><Icon name="trophy" size={18} style={{ color: 'var(--color-warning)' }} /> Longest Session</h3>
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
