'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import SessionDetailModal from '@/components/SessionDetailModal';
import {
    getSessions,
    getCompanies,
    getAllTasks,
    getAllProjects,
    addManualSession,
    deleteSession,
    exportSessionsToCSV,
    downloadCSV,
} from '@/lib/store';
import { formatDuration, formatDurationShort, formatDate, formatTime, getRelativeDate } from '@/lib/utils';

export default function HistoryPage() {
    const [sessions, setSessions] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterCompany, setFilterCompany] = useState('');
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [selectedSession, setSelectedSession] = useState(null);

    // Manual entry form
    const [manualCompany, setManualCompany] = useState('');
    const [manualProject, setManualProject] = useState('');
    const [manualTask, setManualTask] = useState('');
    const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
    const [manualHours, setManualHours] = useState('');
    const [manualMinutes, setManualMinutes] = useState('');
    const [manualSummary, setManualSummary] = useState('');

    const loadData = useCallback(async () => {
        try {
            const filters = {};
            if (filterCompany) filters.companyId = filterCompany;
            const [s, c, p, t] = await Promise.all([
                getSessions(filters),
                getCompanies(),
                getAllProjects(),
                getAllTasks(),
            ]);
            setSessions(s);
            setCompanies(c);
            setProjects(p);
            setTasks(t);
        } catch (err) {
            console.error('Failed to load history', err);
        }
        setLoading(false);
    }, [filterCompany]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleExportCSV = () => {
        const csv = exportSessionsToCSV(sessions);
        downloadCSV(csv, `focusarch-history-${new Date().toISOString().split('T')[0]}.csv`);
    };

    const handleManualEntry = async () => {
        if (!manualTask || (!manualHours && !manualMinutes)) return;
        const durationSeconds = (parseInt(manualHours || 0) * 3600) + (parseInt(manualMinutes || 0) * 60);
        if (durationSeconds <= 0) return;

        const task = tasks.find((t) => t.id === manualTask);
        await addManualSession(
            manualTask,
            task?.project_id || manualProject,
            task?.company_id || manualCompany,
            manualDate,
            durationSeconds,
            manualSummary
        );
        setShowManualEntry(false);
        setManualHours('');
        setManualMinutes('');
        setManualSummary('');
        loadData();
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this session?')) return;
        await deleteSession(id);
        loadData();
    };

    const filteredProjects = manualCompany
        ? projects.filter((p) => p.company_id === manualCompany)
        : projects;

    const filteredTasks = manualProject
        ? tasks.filter((t) => t.project_id === manualProject)
        : tasks;

    // Group sessions by date
    const sessionsByDate = sessions.reduce((acc, session) => {
        const date = formatDate(session.start_time);
        if (!acc[date]) acc[date] = [];
        acc[date].push(session);
        return acc;
    }, {});

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
                    <h2>History</h2>
                    <p>Your session log &amp; punch card</p>
                </div>
                <div className="flex gap-2">
                    <button className="btn btn-secondary" onClick={() => setShowManualEntry(!showManualEntry)}>
                        ＋ Manual Entry
                    </button>
                    <button className="btn btn-primary" onClick={handleExportCSV} disabled={sessions.length === 0}>
                        <Icon name="download" size={14} /> Export CSV
                    </button>
                </div>
            </div>

            {/* Filter */}
            <div className="filter-bar">
                <select
                    className="input"
                    value={filterCompany}
                    onChange={(e) => setFilterCompany(e.target.value)}
                >
                    <option value="">All Companies</option>
                    {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>

            {/* Manual Entry Form */}
            {showManualEntry && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>Add Manual Time Entry</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="input-group">
                            <label>Company</label>
                            <select className="input" value={manualCompany} onChange={(e) => { setManualCompany(e.target.value); setManualProject(''); setManualTask(''); }}>
                                <option value="">Select company...</option>
                                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Project</label>
                            <select className="input" value={manualProject} onChange={(e) => { setManualProject(e.target.value); setManualTask(''); }}>
                                <option value="">Select project...</option>
                                {filteredProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Task</label>
                            <select className="input" value={manualTask} onChange={(e) => setManualTask(e.target.value)}>
                                <option value="">Select task...</option>
                                {filteredTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Date</label>
                            <input type="date" className="input" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
                        </div>
                        <div className="input-group">
                            <label>Hours</label>
                            <input type="number" className="input" placeholder="0" min="0" value={manualHours} onChange={(e) => setManualHours(e.target.value)} />
                        </div>
                        <div className="input-group">
                            <label>Minutes</label>
                            <input type="number" className="input" placeholder="0" min="0" max="59" value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} />
                        </div>
                    </div>
                    <div className="input-group" style={{ marginTop: '12px' }}>
                        <label>Summary (optional)</label>
                        <input className="input" placeholder="What did you work on?" value={manualSummary} onChange={(e) => setManualSummary(e.target.value)} />
                    </div>
                    <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: '16px' }}>
                        <button className="btn btn-primary" onClick={handleManualEntry}>Add Entry</button>
                        <button className="btn btn-ghost" onClick={() => setShowManualEntry(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {/* Session List */}
            {sessions.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icon name="clipboard" size={48} /></div>
                    <h3>No sessions yet</h3>
                    <p>Start tracking time on the Timer page, or add a manual entry above.</p>
                </div>
            ) : (
                Object.entries(sessionsByDate).map(([date, dateSessions]) => (
                    <div key={date} style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', paddingLeft: '4px' }}>
                            {date} — {formatDurationShort(dateSessions.reduce((sum, s) => sum + (s.duration || 0), 0))} total
                        </div>
                        <div className="session-list">
                            {dateSessions.map((session) => (
                                <div
                                    key={session.id}
                                    className="session-item"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => setSelectedSession(session)}
                                >
                                    <div className="session-color" style={{ backgroundColor: session.companies?.color || '#6366f1' }} />
                                    <div className="session-info">
                                        <div className="session-task">
                                            {session.tasks?.name || session.projects?.name || 'Unknown'}
                                            {session.is_manual && <span className="badge badge-manual" style={{ marginLeft: '8px' }}>Manual</span>}
                                        </div>
                                        <div className="session-meta">
                                            {session.companies?.name}
                                            {session.projects?.name && ` → ${session.projects.name}`}
                                        </div>
                                        {session.summary && (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                                                {session.summary}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div className="session-duration">{formatDurationShort(session.duration)}</div>
                                        <div className="session-time">
                                            {formatTime(session.start_time)}
                                            {session.end_time && ` — ${formatTime(session.end_time)}`}
                                        </div>
                                    </div>
                                    <button
                                        className="btn-icon"
                                        title="Edit session"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedSession(session);
                                        }}
                                    >
                                        <Icon name="edit" size={14} />
                                    </button>
                                    <button
                                        className="btn-icon"
                                        style={{ fontSize: '0.75rem' }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(session.id);
                                        }}
                                    >
                                        <Icon name="trash" size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ))
            )}

            {/* Session Detail Modal */}
            {selectedSession && (
                <SessionDetailModal
                    session={selectedSession}
                    onClose={() => setSelectedSession(null)}
                    onSaved={() => {
                        setSelectedSession(null);
                        loadData();
                    }}
                />
            )}
        </AppLayout>
    );
}
