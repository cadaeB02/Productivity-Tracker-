'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { useCompany } from '@/components/CompanyContext';
import { useSidebarOverride } from '@/components/SidebarOverrideContext';
import {
    getCompanies, getTransactions, getNotes, addNote, updateNote,
    getActiveSessions, getAllProjects, getSessions, startSession,
} from '@/lib/store';
import { formatDuration } from '@/lib/utils';

// ── Widget Registry ──
const WIDGET_REGISTRY = [
    { id: 'hours-by-company', name: 'Hours by Company', icon: 'chart', description: 'Time per company bar chart' },
    { id: 'quick-notes', name: 'Quick Notes', icon: 'note', description: 'Recent notes, add new' },
    { id: 'active-timer', name: 'Active Timer', icon: 'timer', description: 'Running work session' },
    { id: 'upcoming-recurring', name: 'Upcoming Recurring', icon: 'dollar', description: 'Next charges due' },
    { id: 'revenue-snapshot', name: 'Revenue Snapshot', icon: 'chart', description: 'Income overview' },
    { id: 'recent-activity', name: 'Recent Activity', icon: 'clipboard', description: 'Latest actions' },
    { id: 'projects-overview', name: 'Projects Overview', icon: 'folder', description: 'Active projects' },
];

const DEFAULT_WIDGETS = ['hours-by-company', 'active-timer', 'quick-notes', 'revenue-snapshot'];

function getStoredLayout() {
    if (typeof window === 'undefined') return null;
    try {
        const stored = localStorage.getItem('nerve-center-layout');
        return stored ? JSON.parse(stored) : null;
    } catch { return null; }
}

function saveLayout(widgetIds) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('nerve-center-layout', JSON.stringify(widgetIds));
}

function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
}

function formatDate(d) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return days < 30 ? `${days}d ago` : formatDate(dateStr.split('T')[0]);
}

function formatDurationShort(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
}

// ═══════════════════════════════════════
// WIDGET COMPONENTS
// ═══════════════════════════════════════

function HoursByCompanyWidget({ sessions, companies, activeCompanyId }) {
    const [animated, setAnimated] = useState(false);
    const [view, setView] = useState('company'); // 'company' | 'day' | 'summary'
    const [period, setPeriod] = useState('all'); // 'all' | 'week' | 'month'

    useEffect(() => {
        setAnimated(false);
        const timer = setTimeout(() => setAnimated(true), 50);
        return () => clearTimeout(timer);
    }, [view, activeCompanyId, period]);

    // Filter by active company
    const companyFiltered = activeCompanyId
        ? sessions.filter(s => s.company_id === activeCompanyId)
        : sessions;

    // Filter by time period
    const now = new Date();
    const filtered = companyFiltered.filter(s => {
        if (period === 'all') return true;
        const start = new Date(s.start_time);
        if (period === 'week') {
            const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
            return start >= weekAgo;
        }
        if (period === 'month') {
            const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);
            return start >= monthAgo;
        }
        return true;
    });

    // Build color map
    const colorMap = {};
    companies.forEach(c => { colorMap[c.id] = c.color || '#6366f1'; });
    const nameMap = {};
    companies.forEach(c => { nameMap[c.id] = c.name; });

    // Active company color for single-company view
    const activeColor = activeCompanyId ? (colorMap[activeCompanyId] || '#6366f1') : null;

    if (filtered.length === 0) {
        return <div className="nc-widget-body"><div className="nc-empty">No tracked time yet</div></div>;
    }

    // Tab button style helper
    const tabStyle = (active) => ({
        fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.04em', padding: '2px 8px', borderRadius: '4px',
        border: '1px solid ' + (active ? 'var(--color-accent)' : 'var(--border-subtle)'),
        background: active ? 'rgba(139,92,246,0.1)' : 'transparent',
        color: active ? 'var(--color-accent)' : 'var(--text-muted)',
        cursor: 'pointer', transition: 'all 0.15s',
    });

    // View tabs
    const viewTabs = (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {[
                { key: 'company', label: 'By Company' },
                { key: 'day', label: 'By Day' },
                { key: 'summary', label: 'Summary' },
            ].map(t => (
                <button key={t.key} onClick={() => setView(t.key)} style={tabStyle(view === t.key)}>
                    {t.label}
                </button>
            ))}
            <div style={{ flex: 1 }} />
            {['all', 'week', 'month'].map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={tabStyle(period === p)}>
                    {p === 'all' ? 'All' : p === 'week' ? '7d' : '30d'}
                </button>
            ))}
        </div>
    );

    // ── By Company view ──
    if (view === 'company') {
        const companyHours = {};
        filtered.forEach(s => {
            const cid = s.company_id;
            const name = nameMap[cid] || s.companies?.name || 'Unknown';
            companyHours[name] = (companyHours[name] || 0) + (s.duration || 0);
        });
        const entries = Object.entries(companyHours).sort((a, b) => b[1] - a[1]);
        const maxSec = Math.max(...entries.map(e => e[1]), 1);

        return (
            <div className="nc-widget-body">
                {viewTabs}
                <div className="nc-bar-chart">
                    {entries.map(([name, seconds]) => {
                        const comp = companies.find(c => c.name === name);
                        return (
                            <div key={name} className="nc-bar-item">
                                <div className="nc-bar-value">{formatDurationShort(seconds)}</div>
                                <div className="nc-bar-track">
                                    <div className="nc-bar-fill" style={{
                                        height: animated ? `${Math.max((seconds / maxSec) * 100, 4)}%` : '0%',
                                        backgroundColor: comp?.color || '#6366f1',
                                        transition: 'height 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                    }} />
                                </div>
                                <div className="nc-bar-label">{name}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── By Day view (stacked company colors) ──
    if (view === 'day') {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        // Aggregate per day per company
        const dayCompanyData = dayNames.map(() => ({})); // [{companyId: seconds}, ...]
        const dayTotals = [0, 0, 0, 0, 0, 0, 0];
        filtered.forEach(s => {
            const day = new Date(s.start_time).getDay();
            const cid = s.company_id || 'unknown';
            dayCompanyData[day][cid] = (dayCompanyData[day][cid] || 0) + (s.duration || 0);
            dayTotals[day] += s.duration || 0;
        });
        const maxDay = Math.max(...dayTotals, 1);

        return (
            <div className="nc-widget-body">
                {viewTabs}
                <div className="nc-bar-chart">
                    {dayNames.map((name, i) => {
                        const compEntries = Object.entries(dayCompanyData[i]).sort((a, b) => b[1] - a[1]);
                        const totalPct = (dayTotals[i] / maxDay) * 100;
                        return (
                            <div key={name} className="nc-bar-item">
                                <div className="nc-bar-value">{dayTotals[i] > 0 ? formatDurationShort(dayTotals[i]) : ''}</div>
                                <div className="nc-bar-track">
                                    <div style={{
                                        width: '100%',
                                        height: animated ? `${Math.max(totalPct, dayTotals[i] > 0 ? 4 : 0)}%` : '0%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        borderRadius: '4px 4px 0 0',
                                        overflow: 'hidden',
                                        transition: `height 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.05}s`,
                                    }}>
                                        {compEntries.map(([cid, sec]) => {
                                            const segPct = dayTotals[i] > 0 ? (sec / dayTotals[i]) * 100 : 0;
                                            return (
                                                <div key={cid} style={{
                                                    flex: `0 0 ${segPct}%`,
                                                    backgroundColor: activeColor || colorMap[cid] || '#6366f1',
                                                    minHeight: '1px',
                                                }} />
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="nc-bar-label">{name}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── Summary view ──
    const totalSec = filtered.reduce((s, x) => s + (x.duration || 0), 0);
    const uniqueDays = new Set(filtered.map(s => new Date(s.start_time).toDateString())).size;
    const avgPerDay = uniqueDays > 0 ? totalSec / uniqueDays : 0;
    const avgSession = filtered.length > 0 ? totalSec / filtered.length : 0;

    // Weekly avg: total / number of weeks spanned
    const dates = filtered.map(s => new Date(s.start_time).getTime());
    const spanMs = dates.length > 0 ? Math.max(...dates) - Math.min(...dates) : 0;
    const weeks = Math.max(Math.ceil(spanMs / (7 * 24 * 3600 * 1000)), 1);
    const months = Math.max(Math.ceil(spanMs / (30 * 24 * 3600 * 1000)), 1);

    return (
        <div className="nc-widget-body">
            {viewTabs}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                    { label: 'Total Hours', value: formatDurationShort(totalSec) },
                    { label: 'Total Sessions', value: filtered.length },
                    { label: 'Avg / Day', value: formatDurationShort(Math.round(avgPerDay)) },
                    { label: 'Avg / Week', value: formatDurationShort(Math.round(totalSec / weeks)) },
                    { label: 'Avg / Month', value: formatDurationShort(Math.round(totalSec / months)) },
                    { label: 'Avg Session', value: formatDurationShort(Math.round(avgSession)) },
                ].map(stat => (
                    <div key={stat.label} style={{
                        background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
                        padding: '10px', textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '1rem', fontWeight: 800 }}>{stat.value}</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '2px' }}>{stat.label}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function QuickNotesWidget({ notes, companies, onAddNote, onAssignCompany }) {
    const [newNote, setNewNote] = useState('');
    const [assigningId, setAssigningId] = useState(null);

    const handleAdd = async () => {
        if (!newNote.trim()) return;
        await onAddNote(newNote.trim());
        setNewNote('');
    };

    return (
        <div className="nc-widget-body">
            <div className="nc-note-input-row">
                <input
                    className="input"
                    placeholder="Quick note..."
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    style={{ fontSize: '0.8rem', flex: 1 }}
                />
                <button className="btn btn-primary" onClick={handleAdd} style={{ padding: '6px 10px', fontSize: '0.75rem' }}>
                    <Icon name="plus" size={12} />
                </button>
            </div>
            <div className="nc-notes-list">
                {notes.length === 0 && <div className="nc-empty">No notes in inbox</div>}
                {notes.slice(0, 5).map(note => (
                    <div key={note.id} className="nc-note-item">
                        <div className="nc-note-content">
                            <div className="nc-note-text">{note.title || note.content?.substring(0, 80) || 'Untitled'}</div>
                            <div className="nc-note-meta">{timeAgo(note.updated_at || note.created_at)}</div>
                        </div>
                        {assigningId === note.id ? (
                            <select
                                className="input"
                                style={{ fontSize: '0.65rem', width: 'auto', padding: '2px 4px' }}
                                autoFocus
                                onChange={e => { const val = e.target.value; if (val) { onAssignCompany(note.id, val); } setAssigningId(null); }}
                                onBlur={() => setTimeout(() => setAssigningId(null), 150)}
                                defaultValue=""
                            >
                                <option value="" disabled>Assign...</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        ) : (
                            <button
                                className="btn-icon"
                                onClick={() => setAssigningId(note.id)}
                                title="Assign to company"
                                style={{ fontSize: '0.6rem', opacity: 0.5 }}
                            >
                                <Icon name="grid" size={12} />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function ActiveTimerWidget({ activeSessions, companies, projects, tasks, onClockIn }) {
    const [elapsed, setElapsed] = useState({});

    useEffect(() => {
        const tick = () => {
            const now = Date.now();
            const newElapsed = {};
            activeSessions.forEach(s => {
                const start = new Date(s.start_time).getTime();
                const pausedDur = (s.paused_duration || 0) * 1000;
                if (s.paused_at) {
                    newElapsed[s.id] = Math.floor((new Date(s.paused_at).getTime() - start - pausedDur) / 1000);
                } else {
                    newElapsed[s.id] = Math.floor((now - start - pausedDur) / 1000);
                }
            });
            setElapsed(newElapsed);
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [activeSessions]);

    // Companies that DON'T have an active session
    const activeCompanyIds = activeSessions.map(s => s.company_id);
    const availableCompanies = companies.filter(c => !activeCompanyIds.includes(c.id));

    return (
        <div className="nc-widget-body">
            {/* Active timers */}
            {activeSessions.map(s => {
                const company = companies.find(c => c.id === s.company_id);
                const task = s.tasks?.name || tasks.find(t => t.id === s.task_id)?.name || '';
                const project = s.projects?.name || projects.find(p => p.id === s.project_id)?.name || '';
                const secs = elapsed[s.id] || 0;

                return (
                    <div key={s.id} className="nc-timer-active">
                        <div className="nc-timer-display">{formatDuration(secs)}</div>
                        <div className="nc-timer-meta">
                            {task && <span className="nc-timer-task">{task}</span>}
                            {project && <span className="nc-timer-project">{project}</span>}
                        </div>
                        {company && (
                            <div className="nc-timer-company">
                                <span className="color-dot" style={{ backgroundColor: company.color, width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block' }} />
                                {company.name}
                            </div>
                        )}
                        {s.paused_at && <span className="nc-timer-badge paused">Paused</span>}
                        {!s.paused_at && <span className="nc-timer-badge running">Running</span>}
                    </div>
                );
            })}

            {/* Remaining companies to clock into */}
            {availableCompanies.length > 0 && (
                <div className="nc-timer-tiles" style={activeSessions.length > 0 ? { marginTop: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' } : undefined}>
                    {availableCompanies.map(c => (
                        <button
                            key={c.id}
                            className="nc-timer-tile"
                            onClick={() => onClockIn(c.id)}
                        >
                            <span className="color-dot" style={{ backgroundColor: c.color, width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                            <span className="nc-timer-tile-name">{c.name}</span>
                            <span className="nc-timer-tile-action">Clock In</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function UpcomingRecurringWidget({ transactions }) {
    const recurring = transactions.filter(t => t.is_recurring);
    if (recurring.length === 0) {
        return <div className="nc-widget-body"><div className="nc-empty">No recurring charges yet</div></div>;
    }
    // Group by description
    const grouped = {};
    recurring.forEach(t => {
        const key = t.description || t.category || 'Recurring';
        if (!grouped[key] || t.date > grouped[key].date) grouped[key] = t;
    });
    const items = Object.values(grouped).map(t => {
        const lastDate = new Date(t.date + 'T00:00:00');
        const nextDate = new Date(lastDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
        const daysUntil = Math.ceil((nextDate - new Date()) / (1000 * 60 * 60 * 24));
        return { ...t, nextDate, daysUntil };
    }).sort((a, b) => a.daysUntil - b.daysUntil);

    return (
        <div className="nc-widget-body">
            {items.slice(0, 5).map((item, i) => (
                <div key={i} className="nc-recurring-item">
                    <div className="nc-recurring-info">
                        <div className="nc-recurring-name">{item.description || 'Recurring Charge'}</div>
                        <div className="nc-recurring-date">
                            Next: {item.nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            <span className={`nc-days-badge ${item.daysUntil <= 7 ? 'urgent' : ''}`}>
                                {item.daysUntil <= 0 ? 'Due!' : `${item.daysUntil}d`}
                            </span>
                        </div>
                    </div>
                    <span className={`nc-recurring-amount ${item.type}`}>
                        {item.type === 'expense' ? '−' : '+'}{formatCurrency(item.amount)}
                    </span>
                </div>
            ))}
        </div>
    );
}

function RevenueSnapshotWidget({ transactions }) {
    const now = new Date();
    const thisMonth = transactions.filter(t => {
        const d = new Date(t.date + 'T00:00:00');
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const revenue = thisMonth.filter(t => t.type === 'revenue').reduce((s, t) => s + parseFloat(t.amount), 0);
    const expenses = thisMonth.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
    const net = revenue - expenses;
    const totalRevenue = transactions.filter(t => t.type === 'revenue').reduce((s, t) => s + parseFloat(t.amount), 0);
    const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);

    return (
        <div className="nc-widget-body">
            <div className="nc-revenue-total">{formatCurrency(totalRevenue)}</div>
            <div className="nc-revenue-label">Total Revenue</div>
            <div className="nc-revenue-grid">
                <div className="nc-revenue-stat">
                    <div className="nc-revenue-stat-value expense">{formatCurrency(totalExpenses)}</div>
                    <div className="nc-revenue-stat-label">Total Expenses</div>
                </div>
                <div className="nc-revenue-stat">
                    <div className={`nc-revenue-stat-value ${net >= 0 ? 'revenue' : 'expense'}`}>{formatCurrency(totalRevenue - totalExpenses)}</div>
                    <div className="nc-revenue-stat-label">Net Income</div>
                </div>
            </div>
            <div className="nc-revenue-bar">
                <div className="nc-revenue-bar-fill" style={{ width: `${totalRevenue > 0 ? Math.min((totalRevenue / (totalRevenue + totalExpenses)) * 100, 100) : 50}%` }} />
            </div>
            <div className="nc-revenue-bar-labels">
                <span>Revenue</span>
                <span>Expenses</span>
            </div>
        </div>
    );
}

function RecentActivityWidget({ transactions, sessions }) {
    // Merge and sort by date
    const activities = [
        ...transactions.slice(0, 5).map(t => ({
            id: `txn-${t.id}`, type: 'transaction', label: t.description || t.category,
            meta: `${t.type === 'expense' ? '−' : '+'}${formatCurrency(t.amount)}`,
            date: t.date + 'T00:00:00', icon: 'dollar',
            className: t.type,
        })),
        ...sessions.slice(0, 5).map(s => ({
            id: `ses-${s.id}`, type: 'session', label: s.tasks?.name || s.summary || 'Work session',
            meta: formatDuration(s.duration || 0),
            date: s.start_time, icon: 'timer',
            className: 'session',
        })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

    if (activities.length === 0) {
        return <div className="nc-widget-body"><div className="nc-empty">No recent activity</div></div>;
    }

    return (
        <div className="nc-widget-body">
            {activities.map(a => (
                <div key={a.id} className="nc-activity-item">
                    <div className={`nc-activity-icon ${a.className}`}>
                        <Icon name={a.icon} size={12} />
                    </div>
                    <div className="nc-activity-info">
                        <div className="nc-activity-label">{a.label}</div>
                        <div className="nc-activity-date">{timeAgo(a.date)}</div>
                    </div>
                    <div className={`nc-activity-meta ${a.className}`}>{a.meta}</div>
                </div>
            ))}
        </div>
    );
}

function ProjectsOverviewWidget({ projects, companies, sessions }) {
    const [sortBy, setSortBy] = useState('hours'); // 'name' | 'hours' | 'recent'

    if (projects.length === 0) {
        return <div className="nc-widget-body"><div className="nc-empty">No projects yet</div></div>;
    }

    // Compute hours per project from sessions
    const projectHours = {};
    const projectLastWorked = {};
    sessions.forEach(s => {
        const pid = s.project_id;
        if (!pid) return;
        projectHours[pid] = (projectHours[pid] || 0) + (s.duration || 0);
        const t = new Date(s.start_time).getTime();
        if (!projectLastWorked[pid] || t > projectLastWorked[pid]) projectLastWorked[pid] = t;
    });

    const maxHours = Math.max(...Object.values(projectHours), 1);

    // Sort
    const sortedProjects = [...projects].sort((a, b) => {
        if (sortBy === 'hours') return (projectHours[b.id] || 0) - (projectHours[a.id] || 0);
        if (sortBy === 'recent') return (projectLastWorked[b.id] || 0) - (projectLastWorked[a.id] || 0);
        return a.name.localeCompare(b.name);
    });

    return (
        <div className="nc-widget-body">
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                {['hours', 'recent', 'name'].map(s => (
                    <button
                        key={s}
                        onClick={() => setSortBy(s)}
                        style={{
                            fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase',
                            letterSpacing: '0.04em', padding: '2px 8px', borderRadius: '4px',
                            border: '1px solid ' + (sortBy === s ? 'var(--color-accent)' : 'var(--border-subtle)'),
                            background: sortBy === s ? 'rgba(139,92,246,0.1)' : 'transparent',
                            color: sortBy === s ? 'var(--color-accent)' : 'var(--text-muted)',
                            cursor: 'pointer', transition: 'all 0.15s',
                        }}
                    >
                        {s === 'hours' ? 'By Hours' : s === 'recent' ? 'Recent' : 'A-Z'}
                    </button>
                ))}
            </div>
            {sortedProjects.slice(0, 6).map(p => {
                const company = companies.find(c => c.id === p.company_id);
                const hrs = projectHours[p.id] || 0;
                const pct = (hrs / maxHours) * 100;
                const lastWorked = projectLastWorked[p.id];
                return (
                    <div key={p.id} className="nc-project-item">
                        <div className="nc-project-info" style={{ flex: 1 }}>
                            <div className="nc-project-name">{p.name}</div>
                            {company && (
                                <div className="nc-project-company">
                                    <span className="color-dot" style={{ backgroundColor: company.color, width: '5px', height: '5px', borderRadius: '50%', display: 'inline-block' }} />
                                    {company.name}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            {hrs > 0 && (
                                <div style={{ width: '40px', height: '6px', borderRadius: '3px', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                                    <div style={{ width: `${Math.max(pct, 5)}%`, height: '100%', borderRadius: '3px', backgroundColor: company?.color || 'var(--color-accent)', transition: 'width 0.4s' }} />
                                </div>
                            )}
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: hrs > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', minWidth: '36px', textAlign: 'right' }}>
                                {hrs > 0 ? formatDurationShort(hrs) : '0m'}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ═══════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════

export default function DashboardPage() {
    const { activeCompanyId } = useCompany();
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [widgetIds, setWidgetIds] = useState(DEFAULT_WIDGETS);
    const [editWidgetIds, setEditWidgetIds] = useState([]);

    // Data states
    const [companies, setCompanies] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [notes, setNotes] = useState([]);
    const [activeSessions, setActiveSessions] = useState([]);
    const [projects, setProjects] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [tasks, setTasks] = useState([]);

    // Drag state
    const dragItem = useRef(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    // Sidebar override for edit mode
    const { setOverrideContent } = useSidebarOverride();

    // Load layout from localStorage
    useEffect(() => {
        const stored = getStoredLayout();
        if (stored && Array.isArray(stored)) setWidgetIds(stored);
    }, []);

    // Load data
    const loadData = useCallback(async () => {
        try {
            const { getAllTasks } = await import('@/lib/store');
            const [comps, txns, notesData, active, projs, allSessions, allTasks] = await Promise.all([
                getCompanies(),
                getTransactions(activeCompanyId ? { companyId: activeCompanyId } : {}),
                getNotes({ category: 'inbox', ...(activeCompanyId ? { companyId: activeCompanyId } : {}) }),
                getActiveSessions(),
                getAllProjects(),
                getSessions(),
                getAllTasks(),
            ]);
            setCompanies(comps);
            setTransactions(txns);
            setNotes(notesData);
            setActiveSessions(active);
            setProjects(projs);
            setSessions(allSessions);
            setTasks(allTasks);
        } catch (err) {
            console.error('Dashboard load error:', err);
        }
        setLoading(false);
    }, [activeCompanyId]);

    useEffect(() => { loadData(); }, [loadData]);

    // Refresh active timer every 30s
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const active = await getActiveSessions();
                setActiveSessions(active);
            } catch {}
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    // Handlers
    const handleAddNote = async (text) => {
        try {
            await addNote({ category: 'inbox', title: '', content: text, company_id: activeCompanyId || null });
            loadData();
        } catch (err) { console.error('Add note error:', err); }
    };

    const handleClockIn = async (companyId) => {
        try {
            // Find first project and task for this company for a quick clock-in
            const companyProjects = projects.filter(p => p.company_id === companyId);
            const proj = companyProjects[0];
            const projTasks = proj ? tasks.filter(t => t.project_id === proj.id) : [];
            const task = projTasks[0];
            await startSession({
                company_id: companyId,
                project_id: proj?.id || null,
                task_id: task?.id || null,
            });
            loadData();
        } catch (err) { console.error('Clock in error:', err); }
    };

    const handleAssignCompany = async (noteId, companyId) => {
        try {
            await updateNote(noteId, { company_id: companyId });
            loadData();
        } catch (err) { console.error('Assign company error:', err); }
    };

    // Edit mode — push widget picker to sidebar
    const enterEditMode = () => {
        setEditWidgetIds([...widgetIds]);
        setEditing(true);
    };

    const saveAndExit = () => {
        setWidgetIds(editWidgetIds);
        saveLayout(editWidgetIds);
        setEditing(false);
        setOverrideContent(null);
    };

    const cancelEdit = () => {
        setEditing(false);
        setOverrideContent(null);
    };

    const addWidget = (id) => {
        if (!editWidgetIds.includes(id)) {
            setEditWidgetIds(prev => [...prev, id]);
        }
    };

    const removeWidget = (id) => {
        setEditWidgetIds(prev => prev.filter(w => w !== id));
    };

    // Smooth drag and drop with live reorder
    const handleDragStart = (e, index) => {
        dragItem.current = index;
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragItem.current === null || dragItem.current === index) {
            setDragOverIndex(null);
            return;
        }
        setDragOverIndex(index);
        // Live reorder
        const from = dragItem.current;
        const items = [...editWidgetIds];
        const [moved] = items.splice(from, 1);
        items.splice(index, 0, moved);
        setEditWidgetIds(items);
        dragItem.current = index;
    };

    const handleDrop = (e) => {
        e.preventDefault();
        dragItem.current = null;
        setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        dragItem.current = null;
        setDragOverIndex(null);
    };

    // Render widget
    const renderWidget = (widgetId) => {
        switch (widgetId) {
            case 'hours-by-company':
                return <HoursByCompanyWidget sessions={sessions} companies={companies} activeCompanyId={activeCompanyId} />;
            case 'quick-notes':
                return <QuickNotesWidget notes={notes} companies={companies} onAddNote={handleAddNote} onAssignCompany={handleAssignCompany} />;
            case 'active-timer':
                return <ActiveTimerWidget activeSessions={activeSessions} companies={companies} projects={projects} tasks={tasks} onClockIn={handleClockIn} />;
            case 'upcoming-recurring':
                return <UpcomingRecurringWidget transactions={transactions} />;
            case 'revenue-snapshot':
                return <RevenueSnapshotWidget transactions={transactions} />;
            case 'recent-activity':
                return <RecentActivityWidget transactions={transactions} sessions={sessions} />;
            case 'projects-overview':
                return <ProjectsOverviewWidget projects={projects} companies={companies} sessions={sessions} />;
            default:
                return <div className="nc-widget-body"><div className="nc-empty">Unknown widget</div></div>;
        }
    };

    const currentWidgets = editing ? editWidgetIds : widgetIds;

    // Push widget picker to sidebar when editing
    useEffect(() => {
        if (!editing) {
            setOverrideContent(null);
            return;
        }
        setOverrideContent(
            <div className="nc-edit-sidebar-list" style={{ padding: '8px' }}>
                <div style={{ padding: '8px 4px 12px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '2px' }}>Available Widgets</h3>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Drag to reorder, + to add</p>
                </div>
                {WIDGET_REGISTRY.map(w => {
                    const isAdded = editWidgetIds.includes(w.id);
                    return (
                        <div key={w.id} className={`nc-edit-widget-option ${isAdded ? 'added' : ''}`}>
                            <div className="nc-edit-widget-info">
                                <Icon name={w.icon} size={16} />
                                <div>
                                    <div className="nc-edit-widget-name">{w.name}</div>
                                    <div className="nc-edit-widget-desc">{w.description}</div>
                                </div>
                            </div>
                            <button
                                className={`nc-edit-add-btn ${isAdded ? 'added' : ''}`}
                                onClick={() => isAdded ? removeWidget(w.id) : addWidget(w.id)}
                            >
                                {isAdded ? <><Icon name="check" size={12} /> Added</> : <><Icon name="plus" size={12} /> Add</>}
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    }, [editing, editWidgetIds, setOverrideContent]);

    if (loading) {
        return <AppLayout title="Nerve Center"><div className="loading-spinner" /></AppLayout>;
    }

    return (
        <AppLayout title="Nerve Center">
            <div className="nc-topbar">
                <div className="nc-topbar-left">
                    <h2 className="nc-title">{editing ? 'Editing Nerve Center' : 'Nerve Center'}</h2>
                </div>
                {editing ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-ghost" onClick={cancelEdit} style={{ fontSize: '0.8rem' }}>
                            Cancel
                        </button>
                        <button className="btn btn-success nc-save-btn" onClick={saveAndExit}>
                            <Icon name="save" size={14} /> Save Layout
                        </button>
                    </div>
                ) : (
                    <button className="btn btn-ghost nc-edit-btn" onClick={enterEditMode}>
                        <Icon name="edit" size={14} /> Edit
                    </button>
                )}
            </div>

            <div className={`nc-widget-grid ${editing ? 'editing' : ''}`}>
                {currentWidgets.map((wId, index) => {
                    const meta = WIDGET_REGISTRY.find(w => w.id === wId);
                    if (!meta) return null;
                    const isDragOver = editing && dragOverIndex === index;
                    return (
                        <div
                            key={wId}
                            className={`nc-widget-card ${editing ? 'edit-mode' : ''} ${isDragOver ? 'drop-target' : ''}`}
                            draggable={editing}
                            onDragStart={editing ? (e) => handleDragStart(e, index) : undefined}
                            onDragOver={editing ? (e) => handleDragOver(e, index) : undefined}
                            onDrop={editing ? handleDrop : undefined}
                            onDragEnd={editing ? handleDragEnd : undefined}
                        >
                            <div className="nc-widget-header">
                                {editing && (
                                    <div className="nc-widget-drag-handle">
                                        <Icon name="menu" size={14} />
                                    </div>
                                )}
                                <div className="nc-widget-title">
                                    <Icon name={meta.icon} size={14} />
                                    {meta.name}
                                </div>
                                {editing && (
                                    <button className="nc-widget-close" onClick={() => removeWidget(wId)}>
                                        <Icon name="close" size={14} />
                                    </button>
                                )}
                            </div>
                            {editing ? (
                                <div className="nc-widget-preview">
                                    {renderWidget(wId)}
                                </div>
                            ) : (
                                renderWidget(wId)
                            )}
                        </div>
                    );
                })}
                {editing && editWidgetIds.length === 0 && (
                    <div className="nc-empty-edit">
                        <Icon name="plus" size={32} />
                        <p>Add widgets from the sidebar</p>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
