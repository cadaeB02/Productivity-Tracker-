'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { useAuth } from '@/components/AuthProvider';
import { getCompanies, getScheduleTasks, getScheduleBlocks, getExceptions, getSessionsForDate, updateScheduleTask, addScheduleTask, deleteScheduleTask } from '@/lib/store';

// Helpers
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const START_HOUR = 0; // Timeline starts at 12 AM (Midnight)
const END_HOUR = 23;  // Timeline ends at 11 PM
const HOUR_HEIGHT = 60; // 60px per hour

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
}

function getSafeDate(dateObj) {
    return dateObj.toISOString().split('T')[0];
}

export default function SchedulePage() {
    const { user } = useAuth();
    
    // Core Layout State
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [viewMode, setViewMode] = useState('today'); // 'inbox', 'today', 'upcoming'
    const [horizonDays, setHorizonDays] = useState(1); // 1, 3, 5, 7
    const [showSessions, setShowSessions] = useState(false);
    
    // Filters Context
    const [projectFilter, setProjectFilter] = useState('all');

    // Current Date Context
    const [currentDate, setCurrentDate] = useState(new Date());

    // Actual Data State
    const [companies, setCompanies] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [blocks, setBlocks] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [selectedTask, setSelectedTask] = useState(null);

    // Drag & Drop / Resizing state
    const [dragOverCell, setDragOverCell] = useState(null);
    const [resizing, setResizing] = useState(null);

    const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

    // Initial Fetch
    useEffect(() => {
        async function load() {
            if (!user) return;
            try {
                const [cmps, tsks, blks] = await Promise.all([
                    getCompanies(),
                    getScheduleTasks({}),
                    getScheduleBlocks(new Date().getFullYear(), new Date().getMonth() + 1),
                ]);
                setCompanies(cmps);
                setTasks(tsks);
                setBlocks(blks);
            } catch (err) {
                console.error("Failed to load schedule data", err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [user]);

    // Fetch real work sessions when Show Sessions is enabled
    useEffect(() => {
        if (!showSessions || !user) { setSessions([]); return; }
        async function loadSessions() {
            try {
                const start = new Date();
                const promises = [];
                for (let i = 0; i < horizonDays; i++) {
                    const d = new Date(start);
                    d.setDate(start.getDate() + i);
                    promises.push(getSessionsForDate(getSafeDate(d)));
                }
                const results = await Promise.all(promises);
                setSessions(results.flat());
            } catch (err) {
                console.error("Failed to load sessions", err);
            }
        }
        loadSessions();
    }, [showSessions, user, horizonDays]);

    // Handle Task Updates from Modal
    const handleSaveTask = async (updates) => {
        if (!selectedTask) return;
        try {
            const updated = await updateScheduleTask(selectedTask.id, updates);
            setTasks(tasks.map(t => t.id === updated.id ? updated : t));
            if (updates.status === 'done') {
                setSelectedTask(null);
            } else {
                setSelectedTask({ ...selectedTask, ...updates });
            }
        } catch (err) {
            console.error(err);
            alert("Failed to update task");
        }
    };

    const handleAddTask = async () => {
        try {
            const newTask = await addScheduleTask("New Task", "unknown", "");
            setTasks([newTask, ...tasks]);
            setSelectedTask(newTask);
        } catch (err) {
            console.error(err);
            alert("Failed to create task");
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!confirm('Delete this task?')) return;
        try {
            await deleteScheduleTask(taskId);
            setTasks(tasks.filter(t => t.id !== taskId));
            setSelectedTask(null);
        } catch (err) {
            console.error(err);
            alert("Failed to delete task");
        }
    };

    // Derived view arrays based on viewMode & currentDate & horizonDays
    const viewDates = [];
    if (viewMode === 'today' || viewMode === 'upcoming') {
        const start = new Date(currentDate);
        if (viewMode === 'today') {
            const t = new Date();
            start.setFullYear(t.getFullYear(), t.getMonth(), t.getDate());
        }
        for (let i = 0; i < horizonDays; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            viewDates.push(d);
        }
    }

    // Helper: calculate top/height for timeline events
    const getBlockStyle = (startStr, endStr) => {
        const sm = parseTimeToMinutes(startStr);
        const em = parseTimeToMinutes(endStr);
        const startOffset = sm - (START_HOUR * 60);
        
        let top = (startOffset / 60) * HOUR_HEIGHT;
        let diff = em - sm;
        
        // Ensure the block is AT LEAST 28px tall so text is never clipped inside a crescent
        let height = Math.max((diff / 60) * HOUR_HEIGHT, 28);

        if (top < 0) {
            height += top;
            top = 0;
        }

        return { top: `${top}px`, height: `${height}px` };
    };

    return (
        <AppLayout hideGlobalSidebar={false}>
            <div className="schedule-workspace">
                
                {/* TODOIST-STYLE INNER SIDEBAR */}
                <div className={`schedule-sidebar ${!sidebarOpen ? 'closed' : ''}`}>
                    <div className="sidebar-header">
                        <button className="btn-icon" onClick={toggleSidebar} title="Collapse Sidebar">
                            <Icon name="menu" size={16} />
                        </button>
                        <span className="sidebar-title">SDLX Schedule</span>
                    </div>

                    <div className="sidebar-primary-action">
                        <button className="btn btn-primary" onClick={handleAddTask} style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 16px', borderRadius: '10px', fontWeight: 600 }}>
                            <Icon name="plus" size={16} /> Add Task
                        </button>
                    </div>

                    <div className="sidebar-nav-section">
                        <button className={`nav-item ${viewMode === 'inbox' && projectFilter === 'all' ? 'active' : ''}`} onClick={() => { setViewMode('inbox'); setProjectFilter('all'); }}>
                            <Icon name="inbox" size={16} /> Inbox
                            <span className="badge">{tasks.filter(t => !t.scheduled_date && t.status !== 'done').length}</span>
                        </button>
                        <button className={`nav-item ${viewMode === 'today' && projectFilter === 'all' ? 'active' : ''}`} onClick={() => { setViewMode('today'); setProjectFilter('all'); setCurrentDate(new Date()); }}>
                            <Icon name="calendar" size={16} /> Today
                        </button>
                        <button className={`nav-item ${viewMode === 'upcoming' && projectFilter === 'all' ? 'active' : ''}`} onClick={() => { setViewMode('upcoming'); setProjectFilter('all'); }}>
                            <Icon name="calendar" size={16} /> Upcoming
                        </button>
                        <button className="nav-item">
                            <Icon name="search" size={16} /> Search & Filters
                        </button>
                    </div>

                    <div className="sidebar-nav-section">
                        <div className="section-title">My Projects</div>
                        {companies.map(company => (
                            <button 
                                key={company.id} 
                                className={`nav-item project-item ${projectFilter === company.id ? 'active' : ''}`}
                                onClick={() => setProjectFilter(company.id)}
                            >
                                <span className="color-dot" style={{ backgroundColor: company.color || '#94a3b8' }}></span> {company.name}
                            </button>
                        ))}
                    </div>

                    <div className="sidebar-mini-calendar">
                        {(() => {
                            const calMonth = currentDate.getMonth();
                            const calYear = currentDate.getFullYear();
                            const firstDay = new Date(calYear, calMonth, 1).getDay();
                            const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
                            const todayStr = getSafeDate(new Date());
                            const cells = [];
                            for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} className="cal-cell empty" />);
                            for (let d = 1; d <= daysInMonth; d++) {
                                const dateObj = new Date(calYear, calMonth, d);
                                const dateStr = getSafeDate(dateObj);
                                const isToday = dateStr === todayStr;
                                const isSelected = dateStr === getSafeDate(currentDate);
                                cells.push(
                                    <button 
                                        key={d} 
                                        className={`cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                                        onClick={() => { setCurrentDate(dateObj); setViewMode('today'); }}
                                    >{d}</button>
                                );
                            }
                            return (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <button className="btn-icon" onClick={() => setCurrentDate(new Date(calYear, calMonth - 1, 1))}><Icon name="chevron-left" size={14} /></button>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{MONTH_NAMES[calMonth]} {calYear}</span>
                                        <button className="btn-icon" onClick={() => setCurrentDate(new Date(calYear, calMonth + 1, 1))}><Icon name="chevron-right" size={14} /></button>
                                    </div>
                                    <div className="mini-cal-grid">
                                        {['S','M','T','W','T','F','S'].map((d,i) => <div key={i} className="cal-cell header">{d}</div>)}
                                        {cells}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>

                {/* AKIFLOW-STYLE MAIN TIMELINE */}
                <div className="schedule-main">
                    
                    <div className="timeline-header-bar">
                        {!sidebarOpen && (
                            <button className="btn-icon" onClick={toggleSidebar}>
                                <Icon name="menu" size={16} />
                            </button>
                        )}
                        <div className="date-display">
                            <h2>{viewMode === 'inbox' ? 'Inbox' : viewMode === 'today' ? 'Today' : 'Upcoming'}</h2>
                            {viewMode !== 'inbox' && <span>{currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric'})}</span>}
                        </div>
                        
                        <div className="view-controls">
                            {viewMode !== 'inbox' && (
                                <div className="horizon-toggle">
                                    {[1, 3, 5, 7].map(days => (
                                        <button 
                                            key={days}
                                            className={`horizon-btn ${horizonDays === days ? 'active' : ''}`}
                                            onClick={() => setHorizonDays(days)}
                                        >
                                            {days}D
                                        </button>
                                    ))}
                                </div>
                            )}
                            <button 
                                className={`btn btn-ghost btn-sm ${showSessions ? 'active-toggle' : ''}`}
                                onClick={() => setShowSessions(!showSessions)}
                            >
                                <Icon name="eye" size={14} /> Show Sessions
                            </button>
                        </div>
                    </div>

                    {viewMode === 'inbox' ? (
                        <div style={{ padding: '24px', overflowY: 'auto' }}>
                            <h3 style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>Unscheduled Tasks</h3>
                            <div className="dateless-tasks-row" style={{ maxWidth: '600px' }}>
                                {tasks.filter(t => !t.scheduled_date && t.status !== 'done' && (projectFilter === 'all' || t.company_id === projectFilter)).map(task => (
                                    <div 
                                        key={task.id} 
                                        className="dateless-task" 
                                        draggable 
                                        onDragStart={(e) => { e.dataTransfer.setData('taskId', task.id); e.dataTransfer.effectAllowed = 'move'; }}
                                        onClick={() => setSelectedTask(task)}
                                    >
                                        <div className="checkbox" onClick={(e) => { e.stopPropagation(); setSelectedTask(task); handleSaveTask({...task, status: 'done'}); }}></div>
                                        <span>{task.title}</span>
                                        {task.task_size && <span className={`stat-badge ${task.task_size}`} style={{marginLeft: 'auto'}}>{task.task_size}</span>}
                                    </div>
                                ))}
                                {tasks.filter(t => !t.scheduled_date && t.status !== 'done').length === 0 && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>Inbox zero.</div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="timeline-grid-container">
                            {viewDates.map((dateObj, dsi) => {
                                const iso = getSafeDate(dateObj);
                                const dayOfWeek = dateObj.getDay();
                                
                                const dayTasks = tasks.filter(t => t.scheduled_date === iso && t.status !== 'done' && (projectFilter === 'all' || t.company_id === projectFilter));
                                const timedTasks = dayTasks.filter(t => t.scheduled_start_time);
                                const datelessTasks = dayTasks.filter(t => !t.scheduled_start_time);
                                
                                const dayBlocks = blocks.filter(b => {
                                    if (projectFilter !== 'all' && b.company_id !== projectFilter) return false;
                                    if (b.date === iso) return true;
                                    if (b.is_recurring && b.recurring_days && b.recurring_days.includes(dayOfWeek)) return true;
                                    return false;
                                });

                                return (
                                    <div key={dsi} className="timeline-day-column">
                                        
                                        <div className="day-header-inbox">
                                            <div style={{ padding: '0 12px 8px', fontWeight: 600, fontSize: '0.95rem', color: dateObj.toDateString() === new Date().toDateString() ? 'var(--accent)' : 'var(--text-primary)' }}>
                                                {DAY_NAMES[dayOfWeek]}, {MONTH_NAMES[dateObj.getMonth()]} {dateObj.getDate()}
                                            </div>
                                            <div className="day-stats" style={{ padding: '0 12px' }}>
                                                {['small', 'medium', 'large'].map(size => {
                                                    const count = dayTasks.filter(t => t.task_size === size).length;
                                                    if (count === 0) return null;
                                                    return <span key={size} className={`stat-badge ${size}`}>{count} {size === 'large' ? 'Lg' : size === 'medium' ? 'Med' : 'Sm'}</span>;
                                                })}
                                            </div>
                                            <div className="dateless-tasks-row" style={{ padding: '0 12px' }}>
                                                {datelessTasks.map(task => (
                                                    <div 
                                                        key={task.id} 
                                                        className="dateless-task" 
                                                        draggable 
                                                        onDragStart={(e) => { e.dataTransfer.setData('taskId', task.id); e.dataTransfer.effectAllowed = 'move'; }}
                                                        onClick={() => setSelectedTask(task)}
                                                    >
                                                        <div className="checkbox" onClick={(e) => { e.stopPropagation(); setSelectedTask(task); handleSaveTask({...task, status: 'done'}); }}></div>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{task.title}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="time-blocks-grid">
                                            {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, i) => {
                                                const hour = i + START_HOUR;
                                                const formattedHour = hour === 0 ? '12 AM' : hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;
                                                const cellId = `${dsi}-${hour}`;
                                                return (
                                                    <div key={i} className="time-row" style={{ height: `${HOUR_HEIGHT}px` }}>
                                                        <div className="time-label">{formattedHour}</div>
                                                        <div 
                                                            className={`time-slot ${dragOverCell === cellId ? 'drag-over' : ''}`}
                                                            onDragOver={(e) => { e.preventDefault(); setDragOverCell(cellId); }}
                                                            onDragLeave={() => setDragOverCell(null)}
                                                            onDrop={async (e) => {
                                                                e.preventDefault();
                                                                setDragOverCell(null);
                                                                const taskId = e.dataTransfer.getData('taskId');
                                                                if (!taskId) return;
                                                                const task = tasks.find(t => t.id === taskId);
                                                                if (!task) return;
                                                                
                                                                let durationMins = 30; // Small
                                                                if (task.task_size === 'medium') durationMins = 60;
                                                                if (task.task_size === 'large') durationMins = 90;
                                                                
                                                                const endHourVal = hour + Math.floor(durationMins / 60);
                                                                const endMinsVal = durationMins % 60;
                                                                
                                                                const sDate = iso;
                                                                const sTime = `${hour.toString().padStart(2, '0')}:00:00`;
                                                                const eTime = `${Math.min(23, endHourVal).toString().padStart(2, '0')}:${endMinsVal.toString().padStart(2, '0')}:00`;

                                                                setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduled_date: sDate, scheduled_start_time: sTime, scheduled_end_time: eTime, status: 'scheduled' } : t));
                                                                try { await updateScheduleTask(taskId, { scheduled_date: sDate, scheduled_start_time: sTime, scheduled_end_time: eTime, status: 'scheduled' }); } catch(err) { console.error(err); }
                                                            }}
                                                        ></div>
                                                    </div>
                                                );
                                            })}
                                            
                                            {dayBlocks.map(block => {
                                                const style = getBlockStyle(block.start_time, block.end_time);
                                                return (
                                                    <div key={block.id} className="mock-block" style={{ 
                                                        ...style, 
                                                        backgroundColor: `${block.color || '#3b82f6'}1a`, 
                                                        borderLeft: `3px solid ${block.color || '#3b82f6'}`,
                                                        zIndex: 1
                                                    }}>
                                                        <span className="time">{block.start_time.slice(0,5)} - {block.end_time.slice(0,5)}</span>
                                                        <strong>{block.label}</strong>
                                                    </div>
                                                );
                                            })}

                                            {/* Show Sessions overlay */}
                                            {showSessions && sessions.filter(s => {
                                                const sDate = s.start_time?.split('T')[0];
                                                return sDate === iso;
                                            }).map(session => {
                                                const startLocal = new Date(session.start_time);
                                                const endLocal = session.end_time ? new Date(session.end_time) : new Date();
                                                const sTimeStr = `${startLocal.getHours().toString().padStart(2,'0')}:${startLocal.getMinutes().toString().padStart(2,'0')}`;
                                                const eTimeStr = `${endLocal.getHours().toString().padStart(2,'0')}:${endLocal.getMinutes().toString().padStart(2,'0')}`;
                                                const style = getBlockStyle(sTimeStr, eTimeStr);
                                                const color = session.companies?.color || '#94a3b8';
                                                return (
                                                    <div key={session.id} className="session-block" style={{
                                                        ...style,
                                                        backgroundColor: `${color}20`,
                                                        borderLeft: `2px solid ${color}`,
                                                    }}>
                                                        {session.companies?.name || 'Session'} - {sTimeStr} to {eTimeStr}
                                                    </div>
                                                );
                                            })}

                                            {timedTasks.map(task => {
                                                const style = getBlockStyle(task.scheduled_start_time, task.scheduled_end_time || task.scheduled_start_time);
                                                return (
                                                    <div key={task.id} className="mock-block task-block" style={{ 
                                                        ...style,
                                                        zIndex: 2,
                                                        cursor: 'pointer',
                                                        touchAction: 'none'
                                                    }} onClick={() => setSelectedTask(task)}>
                                                        <span className="time">{task.scheduled_start_time.slice(0,5)} {task.scheduled_end_time && `- ${task.scheduled_end_time.slice(0,5)}`}</span>
                                                        <strong>{task.title}</strong>
                                                        
                                                        <div 
                                                            className="resize-handle"
                                                            onPointerDown={(e) => {
                                                                e.stopPropagation();
                                                                e.target.setPointerCapture(e.pointerId);
                                                                
                                                                let startMins = parseTimeToMinutes(task.scheduled_start_time);
                                                                let endMins = parseTimeToMinutes(task.scheduled_end_time || task.scheduled_start_time);
                                                                if (endMins <= startMins) endMins = startMins + 30;

                                                                setResizing({
                                                                    id: task.id,
                                                                    startY: e.clientY,
                                                                    originalDurationMins: endMins - startMins,
                                                                    originalStartMin: startMins
                                                                });
                                                            }}
                                                            onPointerMove={(e) => {
                                                                if (!resizing || resizing.id !== task.id) return;
                                                                const deltaY = e.clientY - resizing.startY;
                                                                const snappedDeltaMins = Math.round(deltaY / 15) * 15;
                                                                const newDur = Math.max(15, resizing.originalDurationMins + snappedDeltaMins);
                                                                
                                                                setTasks(prev => prev.map(t => {
                                                                    if (t.id !== task.id) return t;
                                                                    const eMin = resizing.originalStartMin + newDur;
                                                                    const eH = Math.floor(eMin / 60);
                                                                    const eM = Math.floor(eMin % 60);
                                                                    return { ...t, scheduled_end_time: `${Math.min(23, eH).toString().padStart(2, '0')}:${eM.toString().padStart(2, '0')}:00` };
                                                                }));
                                                            }}
                                                            onPointerUp={async (e) => {
                                                                e.stopPropagation();
                                                                e.target.releasePointerCapture(e.pointerId);
                                                                if (!resizing || resizing.id !== task.id) return;
                                                                setResizing(null);
                                                                
                                                                const deltaY = e.clientY - resizing.startY;
                                                                const snappedDeltaMins = Math.round(deltaY / 15) * 15;
                                                                const newDur = Math.max(15, resizing.originalDurationMins + snappedDeltaMins);
                                                                const eMin = resizing.originalStartMin + newDur;
                                                                const eH = Math.floor(eMin / 60);
                                                                const eM = Math.floor(eMin % 60);
                                                                const finalEndTime = `${Math.min(23, eH).toString().padStart(2, '0')}:${eM.toString().padStart(2, '0')}:00`;

                                                                try { await updateScheduleTask(task.id, { scheduled_end_time: finalEndTime }); } catch(err) { console.error(err); }
                                                            }}
                                                        />
                                                    </div>
                                                );
                                            })}
                                            {/* Current Time Indicator */}
                                            {dateObj.toDateString() === new Date().toDateString() && (() => {
                                                const now = new Date();
                                                const nowMins = now.getHours() * 60 + now.getMinutes();
                                                const topPx = ((nowMins - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                                                if (topPx < 0) return null;
                                                return (
                                                    <div className="now-indicator" style={{ top: `${topPx}px` }}>
                                                        <div className="now-dot" />
                                                        <div className="now-line" />
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Task Modal */}
            {selectedTask && (
                <div className="modal-overlay" onClick={() => setSelectedTask(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Edit Task</h3>
                            <button className="btn-icon" onClick={() => setSelectedTask(null)}>
                                <Icon name="close" size={16} />
                            </button>
                        </div>
                        <input 
                            type="text" 
                            className="input" 
                            value={selectedTask.title} 
                            onChange={(e) => setSelectedTask({...selectedTask, title: e.target.value})}
                            style={{ fontSize: '1.1rem', fontWeight: 600, padding: '12px', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        />
                        <textarea 
                            className="input" 
                            value={selectedTask.description || ''} 
                            onChange={(e) => setSelectedTask({...selectedTask, description: e.target.value})}
                            placeholder="Add notes or description..."
                            style={{ minHeight: '80px', marginTop: '12px', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        />
                        
                        <div style={{ marginTop: '16px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Project</label>
                            <select 
                                className="input" 
                                value={selectedTask.company_id || ''} 
                                onChange={(e) => setSelectedTask({...selectedTask, company_id: e.target.value || null})}
                                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%' }}
                            >
                                <option value="">No project</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Date</label>
                                <input 
                                    type="date" 
                                    className="input" 
                                    value={selectedTask.scheduled_date || ''} 
                                    onChange={(e) => setSelectedTask({...selectedTask, scheduled_date: e.target.value || null})}
                                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Start Time</label>
                                <input 
                                    type="time" 
                                    className="input" 
                                    value={selectedTask.scheduled_start_time || ''} 
                                    onChange={(e) => setSelectedTask({...selectedTask, scheduled_start_time: e.target.value || null})}
                                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>End Time</label>
                                <input 
                                    type="time" 
                                    className="input" 
                                    value={selectedTask.scheduled_end_time || ''} 
                                    onChange={(e) => setSelectedTask({...selectedTask, scheduled_end_time: e.target.value || null})}
                                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: '16px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Task Size</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {['small', 'medium', 'large'].map(sz => (
                                    <button 
                                        key={sz}
                                        className={`btn btn-sm ${selectedTask.task_size === sz ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => setSelectedTask({...selectedTask, task_size: sz})}
                                        style={{ flex: 1, textTransform: 'capitalize' }}
                                    >
                                        {sz}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-ghost" style={{ color: 'var(--color-danger)' }} onClick={() => handleSaveTask({ status: 'done' })}>
                                    <Icon name="check-circle" size={16} /> Done
                                </button>
                                <button className="btn btn-ghost" style={{ color: 'var(--text-muted)' }} onClick={() => handleDeleteTask(selectedTask.id)}>
                                    <Icon name="trash" size={16} /> Delete
                                </button>
                            </div>
                            <button className="btn btn-primary" onClick={() => handleSaveTask({ 
                                title: selectedTask.title, 
                                description: selectedTask.description, 
                                scheduled_date: selectedTask.scheduled_date, 
                                scheduled_start_time: selectedTask.scheduled_start_time,
                                scheduled_end_time: selectedTask.scheduled_end_time,
                                task_size: selectedTask.task_size,
                                company_id: selectedTask.company_id
                            })}>
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .schedule-workspace {
                    display: flex;
                    height: calc(100vh - 64px); 
                    background-color: var(--bg-primary);
                    color: var(--text-primary);
                    overflow: hidden;
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                .schedule-sidebar {
                    width: 260px;
                    background-color: var(--bg-secondary);
                    border-right: 1px solid var(--border-color);
                    display: flex;
                    flex-direction: column;
                    transition: width 0.3s ease;
                    overflow-y: auto;
                }
                .schedule-sidebar.closed {
                    width: 0;
                    border: none;
                    overflow: hidden;
                }
                .sidebar-header {
                    display: flex;
                    align-items: center;
                    padding: 16px;
                    gap: 12px;
                }
                .sidebar-title {
                    font-weight: 700;
                    font-size: 1.1rem;
                    letter-spacing: -0.01em;
                }
                .sidebar-primary-action {
                    padding: 0 16px 16px;
                }
                
                .sidebar-nav-section {
                    padding: 0 8px 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .nav-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 8px 12px;
                    background: transparent;
                    border: none;
                    color: var(--text-secondary);
                    font-size: 0.9rem;
                    font-weight: 500;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.15s;
                    text-align: left;
                    width: 100%;
                }
                .nav-item:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }
                .nav-item.active {
                    background: rgba(99, 102, 241, 0.1);
                    color: var(--accent);
                    font-weight: 600;
                }
                .badge {
                    margin-left: auto;
                    background: var(--bg-tertiary);
                    color: var(--text-muted);
                    font-size: 0.75rem;
                    padding: 2px 6px;
                    border-radius: 12px;
                    font-weight: 600;
                }
                .today-badge {
                    background: var(--accent);
                    color: #fff;
                }
                
                .section-title {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-muted);
                    font-weight: 700;
                    padding: 8px 12px 4px;
                }
                .project-item {
                    padding: 6px 12px;
                }
                .color-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }
                .sidebar-mini-calendar {
                    padding: 0 12px 16px;
                    margin-top: auto;
                }
                .mini-cal-grid {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    gap: 1px;
                }
                .cal-cell {
                    width: 100%;
                    aspect-ratio: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.7rem;
                    border: none;
                    background: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    border-radius: 50%;
                }
                .cal-cell:hover:not(.empty):not(.header) {
                    background: var(--bg-tertiary);
                }
                .cal-cell.header {
                    font-weight: 700;
                    color: var(--text-muted);
                    font-size: 0.65rem;
                    cursor: default;
                }
                .cal-cell.empty { cursor: default; }
                .cal-cell.today {
                    background: var(--accent);
                    color: #fff;
                    font-weight: 700;
                }
                .cal-cell.selected:not(.today) {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                    font-weight: 700;
                    box-shadow: inset 0 0 0 2px var(--accent);
                }

                .schedule-main {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                    background-color: var(--bg-primary);
                }
                
                .timeline-header-bar {
                    display: flex;
                    align-items: center;
                    padding: 16px 24px;
                    border-bottom: 1px solid var(--border-color);
                    gap: 16px;
                }
                .date-display h2 {
                    margin: 0;
                    font-size: 1.25rem;
                    font-weight: 700;
                }
                .date-display span {
                    font-size: 0.85rem;
                    color: var(--text-muted);
                }
                .view-controls {
                    margin-left: auto;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .horizon-toggle {
                    display: flex;
                    background: var(--bg-secondary);
                    border-radius: 8px;
                    padding: 2px;
                }
                .horizon-btn {
                    background: transparent;
                    border: none;
                    color: var(--text-secondary);
                    font-size: 0.8rem;
                    font-weight: 600;
                    padding: 4px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                }
                .horizon-btn.active {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .active-toggle {
                    background: var(--accent) !important;
                    color: #fff !important;
                }

                .timeline-grid-container {
                    flex: 1;
                    overflow-y: auto;
                    display: flex;
                    padding: 0 24px;
                }
                .timeline-day-column {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 300px;
                    border-right: 1px solid var(--border-color);
                }
                .timeline-day-column:last-child {
                    border-right: none;
                }

                .day-header-inbox {
                    padding: 16px 0;
                    border-bottom: 1px solid var(--border-color);
                    background: var(--bg-primary);
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                .day-stats {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 12px;
                }
                .stat-badge {
                    font-size: 0.7rem;
                    font-weight: 600;
                    padding: 2px 8px;
                    border-radius: 12px;
                    text-transform: capitalize;
                }
                .stat-badge.small { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
                .stat-badge.medium { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
                .stat-badge.large { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
                .stat-badge.unknown { background: rgba(148, 163, 184, 0.1); color: #94a3b8; }
                
                .dateless-tasks-row {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .dateless-task {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: var(--bg-secondary);
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    border: 1px solid var(--border-color);
                    cursor: grab;
                }
                .checkbox {
                    width: 16px;
                    height: 16px;
                    border: 2px solid var(--text-muted);
                    border-radius: 4px;
                    flex-shrink: 0;
                    cursor: pointer;
                }
                .checkbox:hover {
                    border-color: var(--accent);
                }

                .time-blocks-grid {
                    position: relative;
                    padding-bottom: 40px;
                }
                .time-row {
                    display: flex;
                }
                .time-label {
                    width: 60px;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    text-align: right;
                    padding-right: 12px;
                    position: relative;
                    top: -8px; 
                }
                .time-slot {
                    flex: 1;
                    border-top: 1px solid var(--border-color);
                }

                .mock-block {
                    position: absolute;
                    left: 60px; 
                    right: 16px;
                    border-radius: 6px;
                    padding: 4px 10px;
                    display: flex;
                    flex-direction: column;
                    font-size: 0.85rem;
                    overflow: hidden;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
                }

                .time-slot.drag-over {
                    background: rgba(59, 130, 246, 0.1);
                    border: 2px dashed var(--accent);
                }

                .resize-handle {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 8px;
                    cursor: ns-resize;
                    z-index: 10;
                }
                .resize-handle:hover {
                    background: rgba(0,0,0,0.1);
                }

                .mock-block .time {
                    font-size: 0.7rem;
                    opacity: 0.8;
                    margin-bottom: 2px;
                }
                .mock-block.task-block {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-left: 3px solid var(--text-primary);
                }
                .mock-block.task-block:hover, .dateless-task:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    transform: translateY(-1px);
                    transition: all 0.2s;
                }

                /* MODAL */
                .modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.6);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .modal-content {
                    background: var(--bg-primary);
                    width: 440px;
                    border-radius: 16px;
                    padding: 24px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    border: 1px solid var(--border-color);
                }

                /* Current time indicator */
                .now-indicator {
                    position: absolute;
                    left: 50px;
                    right: 0;
                    z-index: 5;
                    pointer-events: none;
                    display: flex;
                    align-items: center;
                }
                .now-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: #ef4444;
                    flex-shrink: 0;
                }
                .now-line {
                    flex: 1;
                    height: 2px;
                    background: #ef4444;
                }

                /* Session overlay blocks */
                .session-block {
                    position: absolute;
                    left: 60px;
                    right: 16px;
                    border-radius: 4px;
                    padding: 2px 8px;
                    font-size: 0.7rem;
                    opacity: 0.5;
                    pointer-events: none;
                    z-index: 0;
                }
            `}</style>
        </AppLayout>
    );
}
