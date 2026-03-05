'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import ClockOutModal from '@/components/ClockOutModal';
import {
    getCompanies,
    getAllProjects,
    getAllTasks,
    getActiveSession,
    startSession,
    endSession,
} from '@/lib/store';
import { formatDuration } from '@/lib/utils';

export default function TimerPage() {
    const [companies, setCompanies] = useState([]);
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [elapsed, setElapsed] = useState(0);
    const [showClockOut, setShowClockOut] = useState(false);
    const [completedSession, setCompletedSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const timerRef = useRef(null);

    const loadData = useCallback(async () => {
        try {
            const [c, p, t, active] = await Promise.all([
                getCompanies(),
                getAllProjects(),
                getAllTasks(),
                getActiveSession(),
            ]);
            setCompanies(c);
            setProjects(p);
            setTasks(t);
            setActiveSession(active);

            if (active) {
                const start = new Date(active.start_time).getTime();
                setElapsed(Math.floor((Date.now() - start) / 1000));
            }
        } catch (err) {
            console.error('Failed to load data', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Timer interval
    useEffect(() => {
        if (activeSession) {
            timerRef.current = setInterval(() => {
                const start = new Date(activeSession.start_time).getTime();
                setElapsed(Math.floor((Date.now() - start) / 1000));
            }, 1000);
        } else {
            setElapsed(0);
        }
        return () => clearInterval(timerRef.current);
    }, [activeSession]);

    const handleStartTask = async (task) => {
        try {
            // If there's an active session, end it first
            if (activeSession) {
                const ended = await endSession(activeSession.id);
                setCompletedSession({ ...activeSession, ...ended });
                setShowClockOut(true);
            }

            const session = await startSession(task.id, task.project_id || task.projects?.id, task.company_id || task.projects?.company_id);
            const active = await getActiveSession();
            setActiveSession(active);
        } catch (err) {
            console.error('Failed to start session', err);
        }
    };

    const handleStop = async () => {
        if (!activeSession) return;
        try {
            const ended = await endSession(activeSession.id);
            setCompletedSession({ ...activeSession, ...ended });
            setActiveSession(null);
            setElapsed(0);
            clearInterval(timerRef.current);
            setShowClockOut(true);
        } catch (err) {
            console.error('Failed to end session', err);
        }
    };

    const handleClockOutClose = () => {
        setShowClockOut(false);
        setCompletedSession(null);
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
            <div className="page-header">
                <h2>Timer</h2>
                <p>Track your work session in real time</p>
            </div>

            {/* Timer Display */}
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px', position: 'relative', overflow: 'hidden' }}>
                {/* Background glow when active */}
                {activeSession && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '400px',
                        height: '400px',
                        background: 'var(--gradient-glow)',
                        borderRadius: '50%',
                        pointerEvents: 'none',
                    }} />
                )}

                {activeSession ? (
                    <>
                        <div className="timer-task-label">Currently working on</div>
                        <div className="timer-task-name">
                            {activeSession.tasks?.name || activeSession.projects?.name || 'Task'}
                            {activeSession.companies?.name && (
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                                    — {activeSession.companies.name}
                                </span>
                            )}
                        </div>
                        <div className="badge badge-active" style={{ marginBottom: '24px' }}>
                            ● Recording
                        </div>
                    </>
                ) : (
                    <div style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
                        Select a task below to start tracking
                    </div>
                )}

                <div className={`timer-display ${activeSession ? 'active' : ''}`}>
                    {formatDuration(elapsed)}
                </div>

                <div style={{ marginTop: '32px' }}>
                    {activeSession ? (
                        <button className="btn btn-stop" onClick={handleStop}>
                            ⏹ Stop Working
                        </button>
                    ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            👇 Pick a task to start the timer
                        </div>
                    )}
                </div>
            </div>

            {/* Task Switcher */}
            <div className="task-switcher">
                <h3>Quick Switch</h3>

                {groupedTasks.length === 0 ? (
                    <div className="empty-state" style={{ padding: '30px 20px' }}>
                        <div className="emoji">📂</div>
                        <h3>No tasks yet</h3>
                        <p>Go to <a href="/projects">Projects</a> to create companies, projects, and tasks.</p>
                    </div>
                ) : (
                    groupedTasks.map((company) => (
                        <div key={company.id} className="task-group">
                            <div className="task-group-header">
                                <span className="color-dot" style={{ backgroundColor: company.color }} />
                                {company.name}
                            </div>
                            {company.projects.map((project) => (
                                <div key={project.id}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '4px 0 2px 20px', fontWeight: 500 }}>
                                        {project.name}
                                    </div>
                                    {project.tasks.map((task) => (
                                        <div
                                            key={task.id}
                                            className={`task-item ${activeSession?.task_id === task.id ? 'active' : ''}`}
                                            onClick={() => handleStartTask(task)}
                                        >
                                            <span>{task.name}</span>
                                            <span className="play-icon">▶</span>
                                        </div>
                                    ))}
                                    {project.tasks.length === 0 && (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '4px 12px 4px 32px', fontStyle: 'italic' }}>
                                            No tasks — add some in Projects
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>

            {/* Clock Out Modal */}
            {showClockOut && completedSession && (
                <ClockOutModal
                    session={completedSession}
                    onClose={handleClockOutClose}
                    onSaved={loadData}
                />
            )}
        </AppLayout>
    );
}
