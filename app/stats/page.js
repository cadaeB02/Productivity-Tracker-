'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { getStats } from '@/lib/store';
import { formatDurationShort } from '@/lib/utils';

export default function StatsPage() {
    const [sessions, setSessions] = useState([]);
    const [dateRange, setDateRange] = useState('week');
    const [loading, setLoading] = useState(true);

    const loadStats = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getStats(dateRange);
            setSessions(data);
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

    // Hours by day of week
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayHours = [0, 0, 0, 0, 0, 0, 0];
    sessions.forEach((s) => {
        const day = new Date(s.start_time).getDay();
        dayHours[day] += s.duration || 0;
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
                                        className="bar-chart-bar"
                                        style={{
                                            height: `${Math.max(percentage, 3)}%`,
                                            backgroundColor: companyColors[name],
                                        }}
                                    />
                                    <div className="bar-chart-label">{name}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Day of Week Distribution */}
            <div className="card" style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '20px' }}>By Day of Week</h3>
                <div className="bar-chart">
                    {dayNames.map((day, i) => {
                        const percentage = (dayHours[i] / maxDayHours) * 100;
                        return (
                            <div key={day} className="bar-chart-item">
                                <div className="bar-chart-value">{dayHours[i] > 0 ? formatDurationShort(dayHours[i]) : ''}</div>
                                <div
                                    className="bar-chart-bar"
                                    style={{
                                        height: `${Math.max(percentage, 3)}%`,
                                        background: dayHours[i] > 0 ? 'var(--gradient-accent)' : 'var(--bg-elevated)',
                                    }}
                                />
                                <div className="bar-chart-label">{day}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Longest Session */}
            {longestSession && (
                <div className="card">
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px' }}>🏆 Longest Session</h3>
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
        </AppLayout>
    );
}
