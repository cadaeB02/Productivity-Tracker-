'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import ClockOutModal from '@/components/ClockOutModal';
import PendingSummariesModal from '@/components/PendingSummariesModal';
import Icon from '@/components/Icon';
import {
    getCompanies,
    getAllProjects,
    getAllTasks,
    getActiveSessions,
    startSession,
    endSession,
    pauseSession,
    resumeSession,
    updateSession,
} from '@/lib/store';
import { formatDuration, formatTime } from '@/lib/utils';

export default function TimerPage() {
    const [companies, setCompanies] = useState([]);
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [activeSessions, setActiveSessions] = useState([]);
    const [elapsedMap, setElapsedMap] = useState({});
    const [showClockOut, setShowClockOut] = useState(false);
    const [currentClockOutSession, setCurrentClockOutSession] = useState(null);
    const [pendingSummaries, setPendingSummaries] = useState([]);
    const [showPendingSummaries, setShowPendingSummaries] = useState(false);
    const [loading, setLoading] = useState(true);
    const [editingStartTime, setEditingStartTime] = useState(null); // session id being edited
    const [expanded, setExpanded] = useState({}); // tile expand state
    const timerRef = useRef(null);

    const loadData = useCallback(async () => {
        try {
            const [c, p, t, active] = await Promise.all([
                getCompanies(),
                getAllProjects(),
                getAllTasks(),
                getActiveSessions(),
            ]);
            setCompanies(c);
            setProjects(p);
            setTasks(t);
            setActiveSessions(active);

            // Initialize elapsed for each active session
            const now = Date.now();
            const newElapsed = {};
            active.forEach((s) => {
                if (s.paused_at) {
                    // Paused: show time up to when it was paused, minus previous pauses
                    const start = new Date(s.start_time).getTime();
                    const pausedAt = new Date(s.paused_at).getTime();
                    const pausedDur = (s.paused_duration || 0) * 1000;
                    newElapsed[s.id] = Math.floor((pausedAt - start - pausedDur) / 1000);
                } else {
                    const start = new Date(s.start_time).getTime();
                    const pausedDur = (s.paused_duration || 0) * 1000;
                    newElapsed[s.id] = Math.floor((now - start - pausedDur) / 1000);
                }
            });
            setElapsedMap(newElapsed);
        } catch (err) {
            console.error('Failed to load data', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Timer interval — ticks all non-paused sessions
    useEffect(() => {
        if (activeSessions.length > 0) {
            timerRef.current = setInterval(() => {
                const now = Date.now();
                setElapsedMap((prev) => {
                    const next = { ...prev };
                    activeSessions.forEach((s) => {
                        if (!s.paused_at) {
                            const start = new Date(s.start_time).getTime();
                            const pausedDur = (s.paused_duration || 0) * 1000;
                            next[s.id] = Math.max(0, Math.floor((now - start - pausedDur) / 1000));
                        }
                    });
                    return next;
                });
            }, 1000);
        } else {
            setElapsedMap({});
        }
        return () => clearInterval(timerRef.current);
    }, [activeSessions]);

    const handleStartTask = async (task) => {
        // Don't start if task already has an active session
        const alreadyActive = activeSessions.find((s) => s.task_id === task.id);
        if (alreadyActive) return;

        try {
            await startSession(
                task.id,
                task.project_id || task.projects?.id,
                task.company_id || task.projects?.company_id
            );
            const active = await getActiveSessions();
            setActiveSessions(active);
            // Initialize elapsed for new session
            const now = Date.now();
            const newElapsed = {};
            active.forEach((s) => {
                if (s.paused_at) {
                    const start = new Date(s.start_time).getTime();
                    const pausedAt = new Date(s.paused_at).getTime();
                    const pausedDur = (s.paused_duration || 0) * 1000;
                    newElapsed[s.id] = Math.floor((pausedAt - start - pausedDur) / 1000);
                } else {
                    const start = new Date(s.start_time).getTime();
                    const pausedDur = (s.paused_duration || 0) * 1000;
                    newElapsed[s.id] = Math.floor((now - start - pausedDur) / 1000);
                }
            });
            setElapsedMap(newElapsed);
        } catch (err) {
            console.error('Failed to start session', err);
        }
    };

    const handlePause = async (session) => {
        try {
            await pauseSession(session.id);
            const active = await getActiveSessions();
            setActiveSessions(active);
        } catch (err) {
            console.error('Failed to pause session', err);
        }
    };

    const handleResume = async (session) => {
        try {
            await resumeSession(session.id);
            const active = await getActiveSessions();
            setActiveSessions(active);
        } catch (err) {
            console.error('Failed to resume session', err);
        }
    };

    const handleStop = async (session) => {
        try {
            const ended = await endSession(session.id);
            const completedData = { ...session, ...ended, elapsed: elapsedMap[session.id] || 0 };
            setCurrentClockOutSession(completedData);
            setShowClockOut(true);
            // Refresh active sessions
            const active = await getActiveSessions();
            setActiveSessions(active);
        } catch (err) {
            console.error('Failed to end session', err);
        }
    };

    const handleUpdateStartTime = async (session, newTimeStr) => {
        try {
            if (!newTimeStr) return;
            // Build a local Date from just HH:MM — keep today's date
            const [hours, minutes] = newTimeStr.split(':').map(Number);
            const newStart = new Date();
            newStart.setHours(hours, minutes, 0, 0);

            // Don't allow future start times
            const now = new Date();
            if (newStart > now) {
                setEditingStartTime(null);
                return;
            }

            await updateSession(session.id, { start_time: newStart.toISOString() });
            // Update local state immediately
            setActiveSessions(prev => prev.map(s =>
                s.id === session.id ? { ...s, start_time: newStart.toISOString() } : s
            ));
            // Recalculate elapsed
            const pausedDur = (session.paused_duration || 0) * 1000;
            setElapsedMap(prev => ({
                ...prev,
                [session.id]: Math.max(0, Math.floor((Date.now() - newStart.getTime() - pausedDur) / 1000))
            }));
            setEditingStartTime(null);
        } catch (err) {
            console.error('Failed to update start time', err);
        }
    };

    const handleClockOutClose = (skipped = false) => {
        if (skipped && currentClockOutSession) {
            setPendingSummaries((prev) => [...prev, currentClockOutSession]);
        }
        setShowClockOut(false);
        setCurrentClockOutSession(null);

        // If no more active sessions and there are pending summaries, show the batch modal
        if (activeSessions.length === 0 && (pendingSummaries.length > 0 || skipped)) {
            setTimeout(() => {
                setShowPendingSummaries(true);
            }, 300);
        }
    };

    const handlePendingSummariesClose = () => {
        setShowPendingSummaries(false);
        setPendingSummaries([]);
        loadData();
    };

    // Group tasks by company → project
    const groupedTasks = companies.map((company) => {
        const companyProjects = projects.filter((p) => p.company_id === company.id);
        return {
            ...company,
            projects: companyProjects.map((project) => ({
                ...project,
                tasks: tasks.filter((t) => t.project_id === project.id),
            })),
        };
    });

    // Active task IDs for highlighting
    const activeTaskIds = new Set(activeSessions.map((s) => s.task_id));
    const contextSwitchCount = activeSessions.length;

    const toggleExpand = (id) => {
        setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    if (loading) {
        return (
            <AppLayout>
                <div className="loading-page">
                    <div className="loading-spinner" />
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2>Timer</h2>
                    <p>Track your work sessions in real time</p>
                </div>
                {contextSwitchCount > 1 && (
                    <div className="context-switch-badge">
                        <Icon name="shuffle" size={14} /> Context Switches: {contextSwitchCount}
                    </div>
                )}
            </div>

            {/* Active Sessions */}
            {activeSessions.length > 0 && (
                <div className="active-sessions-section">
                    <h3 className="active-sessions-title">
                        Active Sessions ({activeSessions.length})
                    </h3>
                    <div className="active-sessions-grid">
                        {activeSessions.map((session) => {
                            const isPaused = !!session.paused_at;
                            const elapsed = elapsedMap[session.id] || 0;
                            const taskName = session.tasks?.name || session.projects?.name || 'Task';
                            const companyName = session.companies?.name || '';
                            const companyColor = session.companies?.color || '#6366f1';

                            return (
                                <div
                                    key={session.id}
                                    className={`session-card ${isPaused ? 'paused' : 'running'}`}
                                >
                                    <div className="session-card-header">
                                        <div className="session-card-info">
                                            <div className={`badge ${isPaused ? 'badge-paused' : 'badge-active'}`}>
                                                {isPaused ? <><Icon name="pause" size={10} /> Paused</> : <><Icon name="record" size={10} /> Recording</>}
                                            </div>
                                            <div className="session-card-task">{taskName}</div>
                                            {companyName && (
                                                <div className="session-card-company">
                                                    <span className="color-dot" style={{ backgroundColor: companyColor }} />
                                                    {companyName}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className={`session-card-timer ${isPaused ? 'paused' : 'active'}`}>
                                        {formatDuration(elapsed)}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>Started:</span>
                                        {editingStartTime === session.id ? (
                                            <input
                                                type="time"
                                                className="input"
                                                style={{ padding: '2px 6px', fontSize: '0.75rem', width: 'auto' }}
                                                defaultValue={(() => {
                                                    const d = new Date(session.start_time);
                                                    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                                                })()}
                                                onBlur={(e) => handleUpdateStartTime(session, e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleUpdateStartTime(session, e.target.value);
                                                    if (e.key === 'Escape') setEditingStartTime(null);
                                                }}
                                                autoFocus
                                            />
                                        ) : (
                                            <span
                                                style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                                                onClick={() => setEditingStartTime(session.id)}
                                                title="Click to change start time"
                                            >
                                                {formatTime(session.start_time)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="session-card-actions">
                                        {isPaused ? (
                                            <button
                                                className="btn btn-resume btn-sm"
                                                onClick={() => handleResume(session)}
                                            >
                                                <Icon name="play" size={12} /> Resume
                                            </button>
                                        ) : (
                                            <button
                                                className="btn btn-pause btn-sm"
                                                onClick={() => handlePause(session)}
                                            >
                                                <Icon name="pause" size={12} /> Pause
                                            </button>
                                        )}
                                        <button
                                            className="btn btn-stop-sm btn-sm"
                                            onClick={() => handleStop(session)}
                                        >
                                            <Icon name="stop" size={12} /> Stop
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* No active sessions prompt */}
            {activeSessions.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
                        Select a task below to start tracking
                    </div>
                    <div className="timer-display">0:00:00</div>
                    <div style={{ marginTop: '32px' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            <Icon name="arrow-down" size={14} /> Pick a task to start the timer
                        </div>
                    </div>
                </div>
            )}

            {/* Pending summaries button */}
            {pendingSummaries.length > 0 && (
                <div style={{ textAlign: 'center', marginTop: '16px' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => setShowPendingSummaries(true)}
                    >
                        <Icon name="clipboard" size={14} /> {pendingSummaries.length} Pending {pendingSummaries.length === 1 ? 'Summary' : 'Summaries'}
                    </button>
                </div>
            )}

            {/* Task Switcher — Tile Grid */}
            <div className="task-switcher">
                <h3><Icon name="grid" size={16} className="icon-inline" /> Quick Switch</h3>

                {groupedTasks.length === 0 ? (
                    <div className="empty-state" style={{ padding: '30px 20px' }}>
                        <div className="empty-state-icon"><Icon name="folder" size={48} /></div>
                        <h3>No tasks yet</h3>
                        <p>Go to <a href="/projects">Projects</a> to create companies, projects, and tasks.</p>
                    </div>
                ) : (
                    <div className="company-tile-grid">
                        {groupedTasks.map((company) => {
                            const totalTasks = company.projects.reduce((sum, p) => sum + p.tasks.length, 0);
                            const activeCount = company.projects.reduce((sum, p) =>
                                sum + p.tasks.filter(t => activeTaskIds.has(t.id)).length, 0);
                            const isExpanded = expanded[company.id];

                            return (
                                <div
                                    key={company.id}
                                    className="company-tile"
                                    style={{ cursor: 'default' }}
                                >
                                    {/* Color accent bar */}
                                    <div className="tile-accent" style={{ backgroundColor: company.color }} />

                                    {/* Tile header */}
                                    <div className="tile-header" onClick={() => toggleExpand(company.id)}>
                                        <div className="tile-title-row">
                                            <span className="color-dot" style={{ backgroundColor: company.color, width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                                            <span className="tile-name">{company.name}</span>
                                            {company.company_type === 'physical' && <span className="badge badge-physical">Physical</span>}
                                            {activeCount > 0 && (
                                                <span className="badge badge-active" style={{ marginLeft: '4px' }}>
                                                    <Icon name="record" size={8} /> {activeCount} active
                                                </span>
                                            )}
                                        </div>
                                        <div className="tile-meta">
                                            <span>{company.projects.length} project{company.projects.length !== 1 ? 's' : ''}</span>
                                            <span>•</span>
                                            <span>{totalTasks} task{totalTasks !== 1 ? 's' : ''}</span>
                                        </div>
                                    </div>

                                    {/* Expanded body — projects & tasks */}
                                    {isExpanded && (
                                        <div className="tile-body">
                                            {company.projects.map((project) => (
                                                <div key={project.id} style={{ marginBottom: '8px' }}>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '4px 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        {project.name}
                                                    </div>
                                                    {project.tasks.map((task) => {
                                                        const isActive = activeTaskIds.has(task.id);
                                                        const activeSession = activeSessions.find((s) => s.task_id === task.id);
                                                        const elapsed = activeSession ? elapsedMap[activeSession.id] || 0 : 0;

                                                        return (
                                                            <div
                                                                key={task.id}
                                                                className={`task-item ${isActive ? 'active' : ''}`}
                                                                onClick={() => handleStartTask(task)}
                                                            >
                                                                <span>{task.name}</span>
                                                                {isActive ? (
                                                                    <span className="task-item-elapsed">
                                                                        {formatDuration(elapsed)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="play-icon"><Icon name="play" size={12} /></span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    {project.tasks.length === 0 && (
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '4px 0 4px 12px', fontStyle: 'italic' }}>
                                                            No tasks — add some in Projects
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Clock Out Modal */}
            {showClockOut && currentClockOutSession && (
                <ClockOutModal
                    session={currentClockOutSession}
                    onClose={handleClockOutClose}
                    onSaved={loadData}
                    hasMoreSessions={activeSessions.length > 0}
                />
            )}

            {/* Pending Summaries Modal */}
            {showPendingSummaries && pendingSummaries.length > 0 && (
                <PendingSummariesModal
                    sessions={pendingSummaries}
                    onClose={handlePendingSummariesClose}
                    onSaved={loadData}
                />
            )}
        </AppLayout>
    );
}
