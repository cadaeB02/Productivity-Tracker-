'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { useCompany } from '@/components/CompanyContext';
import { useSidebarOverride } from '@/components/SidebarOverrideContext';
import {
    getCompanies, getTransactions, getNotes, addNote, updateNote,
    getActiveSessions, getAllProjects, getSessions,
} from '@/lib/store';
import { formatDuration } from '@/lib/utils';

// ── Widget Registry ──
const WIDGET_REGISTRY = [
    { id: 'quick-notes', name: 'Quick Notes', icon: 'note', description: 'Recent notes, add new' },
    { id: 'active-timer', name: 'Active Timer', icon: 'timer', description: 'Running work session' },
    { id: 'upcoming-recurring', name: 'Upcoming Recurring', icon: 'dollar', description: 'Next charges due' },
    { id: 'revenue-snapshot', name: 'Revenue Snapshot', icon: 'chart', description: 'Income overview' },
    { id: 'recent-activity', name: 'Recent Activity', icon: 'clipboard', description: 'Latest actions' },
    { id: 'projects-overview', name: 'Projects Overview', icon: 'folder', description: 'Active projects' },
];

const DEFAULT_WIDGETS = ['quick-notes', 'active-timer', 'upcoming-recurring', 'revenue-snapshot'];

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

// ═══════════════════════════════════════
// WIDGET COMPONENTS
// ═══════════════════════════════════════

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

function ActiveTimerWidget({ activeSessions, companies, projects, tasks }) {
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

    if (activeSessions.length === 0) {
        return (
            <div className="nc-widget-body">
                <div className="nc-timer-idle">
                    <Icon name="timer" size={28} />
                    <div className="nc-timer-idle-text">No active session</div>
                    <a href="/" className="nc-timer-link">Start Timer</a>
                </div>
            </div>
        );
    }

    return (
        <div className="nc-widget-body">
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
            meta: formatDuration(s.duration_seconds || 0),
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

function ProjectsOverviewWidget({ projects, companies }) {
    if (projects.length === 0) {
        return <div className="nc-widget-body"><div className="nc-empty">No projects yet</div></div>;
    }
    return (
        <div className="nc-widget-body">
            {projects.slice(0, 6).map(p => {
                const company = companies.find(c => c.id === p.company_id);
                return (
                    <div key={p.id} className="nc-project-item">
                        <div className="nc-project-info">
                            <div className="nc-project-name">{p.name}</div>
                            {company && (
                                <div className="nc-project-company">
                                    <span className="color-dot" style={{ backgroundColor: company.color, width: '5px', height: '5px', borderRadius: '50%', display: 'inline-block' }} />
                                    {company.name}
                                </div>
                            )}
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
            setSessions(allSessions.slice(0, 10));
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
            case 'quick-notes':
                return <QuickNotesWidget notes={notes} companies={companies} onAddNote={handleAddNote} onAssignCompany={handleAssignCompany} />;
            case 'active-timer':
                return <ActiveTimerWidget activeSessions={activeSessions} companies={companies} projects={projects} tasks={tasks} />;
            case 'upcoming-recurring':
                return <UpcomingRecurringWidget transactions={transactions} />;
            case 'revenue-snapshot':
                return <RevenueSnapshotWidget transactions={transactions} />;
            case 'recent-activity':
                return <RecentActivityWidget transactions={transactions} sessions={sessions} />;
            case 'projects-overview':
                return <ProjectsOverviewWidget projects={projects} companies={companies} />;
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
