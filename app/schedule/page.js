'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import {
    getScheduleBlocks,
    addScheduleBlock,
    deleteScheduleBlock,
    addScheduleException,
    getExceptions,
    getScheduleTasks,
    addScheduleTask,
    updateScheduleTask,
    deleteScheduleTask,
    scheduleTask,
    getSessionsForDate,
    getSessionsForMonth,
    getSleepLog,
    getSleepLogs,
    upsertSleepLog,
    importSleepLogs,
    getCompanies,
    getAutoClockRules,
} from '@/lib/store';
import { chatWithAgent, hasApiKey } from '@/lib/gemini';
import { formatTime } from '@/lib/utils';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

const DURATION_OPTIONS = [
    { value: 'short', label: 'Short', color: '#22c55e' },
    { value: 'medium', label: 'Med', color: '#f59e0b' },
    { value: 'long', label: 'Long', color: '#ef4444' },
    { value: 'unknown', label: '?', color: '#6366f1' },
];

// Duration estimate → approximate minutes for AI scheduling
const DURATION_MINUTES = { short: 30, medium: 60, long: 120, unknown: 45 };

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
}

function minutesToTime(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatHour(hour) {
    if (hour === 0) return '12am';
    if (hour < 12) return `${hour}am`;
    if (hour === 12) return '12pm';
    return `${hour - 12}pm`;
}

export default function SchedulePage() {
    const today = new Date();
    const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const [selectedDate, setSelectedDate] = useState(null);
    const [blocks, setBlocks] = useState([]);
    const [exceptions, setExceptions] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [daySessions, setDaySessions] = useState([]);
    const [monthSessions, setMonthSessions] = useState([]);
    const [sleepLog, setSleepLog] = useState(null);
    const [sleepLogs, setSleepLogs] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [autoClockRules, setAutoClockRules] = useState([]);
    const [loading, setLoading] = useState(true);

    // Task notepad states
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskDuration, setNewTaskDuration] = useState('medium');

    // Add block states
    const [showAddBlock, setShowAddBlock] = useState(false);
    const [blockLabel, setBlockLabel] = useState('');
    const [blockStart, setBlockStart] = useState('09:00');
    const [blockEnd, setBlockEnd] = useState('17:00');
    const [blockType, setBlockType] = useState('planned');
    const [blockRecurring, setBlockRecurring] = useState(false);
    const [blockDays, setBlockDays] = useState([]);
    const [blockColor, setBlockColor] = useState('#6366f1');

    // Sleep input
    const [showSleepInput, setShowSleepInput] = useState(false);
    const [wakeTimeInput, setWakeTimeInput] = useState('06:00');
    const [sleepTimeInput, setSleepTimeInput] = useState('22:00');

    // AI chat
    const [aiMessage, setAiMessage] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [aiLoading, setAiLoading] = useState(false);

    // Apple Health import
    const [showImport, setShowImport] = useState(false);
    const fileInputRef = useRef(null);

    // Timeline detail panel
    const [expandedBlock, setExpandedBlock] = useState(null);
    const [filterCompany, setFilterCompany] = useState('all');

    const timelineRef = useRef(null);

    const loadMonthData = useCallback(async () => {
        setLoading(true);
        try {
            const [b, exc, t, ms, sl, c, rules] = await Promise.all([
                getScheduleBlocks(currentYear, currentMonth),
                getExceptions(currentYear, currentMonth),
                getScheduleTasks(),
                getSessionsForMonth(currentYear, currentMonth),
                getSleepLogs(currentYear, currentMonth),
                getCompanies(),
                getAutoClockRules(),
            ]);
            setBlocks(b);
            setExceptions(exc);
            setTasks(t);
            setMonthSessions(ms);
            setSleepLogs(sl);
            setCompanies(c);
            setAutoClockRules(rules);
        } catch (err) {
            console.error('Failed to load schedule data', err);
        }
        setLoading(false);
    }, [currentYear, currentMonth]);

    useEffect(() => {
        loadMonthData();
    }, [loadMonthData]);

    // Load day-specific data when a date is selected
    useEffect(() => {
        if (!selectedDate) return;
        const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;
        Promise.all([
            getSessionsForDate(dateStr),
            getSleepLog(dateStr),
        ]).then(([sessions, sleep]) => {
            setDaySessions(sessions);
            setSleepLog(sleep);
            if (sleep) {
                const wt = sleep.wake_time ? new Date(sleep.wake_time) : null;
                const st = sleep.sleep_time ? new Date(sleep.sleep_time) : null;
                if (wt) setWakeTimeInput(`${String(wt.getHours()).padStart(2, '0')}:${String(wt.getMinutes()).padStart(2, '0')}`);
                if (st) setSleepTimeInput(`${String(st.getHours()).padStart(2, '0')}:${String(st.getMinutes()).padStart(2, '0')}`);
            }
        });
    }, [selectedDate, currentYear, currentMonth]);

    // Calendar helpers
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay();
    const todayDate = today.getDate();
    const isCurrentMonth = today.getMonth() + 1 === currentMonth && today.getFullYear() === currentYear;

    const prevMonth = () => {
        if (currentMonth === 1) { setCurrentMonth(12); setCurrentYear(y => y - 1); }
        else setCurrentMonth(m => m - 1);
        setSelectedDate(null);
    };

    const nextMonth = () => {
        if (currentMonth === 12) { setCurrentMonth(1); setCurrentYear(y => y + 1); }
        else setCurrentMonth(m => m + 1);
        setSelectedDate(null);
    };

    // Check if a day has activity
    const getDayInfo = (day) => {
        const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayOfWeek = new Date(currentYear, currentMonth - 1, day).getDay();
        const isException = exceptions.some(e => e.exception_date === dateStr);

        // Sessions for this day
        const sessions = monthSessions.filter(s => {
            const d = new Date(s.start_time);
            return d.getDate() === day;
        });

        // Blocks for this day (recurring + specific)
        const dayBlocks = blocks.filter(b => {
            if (b.is_exception) return false;
            if (b.date === dateStr) return true;
            if (b.is_recurring && b.recurring_days?.includes(dayOfWeek)) return true;
            return false;
        });

        // Scheduled tasks for this day
        const scheduledTasks = tasks.filter(t => t.scheduled_date === dateStr);

        // Sleep log
        const sleep = sleepLogs.find(s => s.date === dateStr);

        // Company colors from sessions
        const colors = [...new Set(sessions.map(s => s.companies?.color).filter(Boolean))];
        const blockColors = [...new Set(dayBlocks.map(b => b.color || b.companies?.color).filter(Boolean))];
        const allColors = [...new Set([...colors, ...blockColors])];

        return {
            hasSessions: sessions.length > 0,
            hasBlocks: dayBlocks.length > 0,
            hasScheduledTasks: scheduledTasks.length > 0,
            hasSleep: !!sleep,
            isException,
            colors: allColors,
            sessionCount: sessions.length,
            blockCount: dayBlocks.length,
        };
    };

    // Get blocks for the selected day
    const getSelectedDayBlocks = () => {
        if (!selectedDate) return [];
        const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;
        const dayOfWeek = new Date(currentYear, currentMonth - 1, selectedDate).getDay();
        const isException = exceptions.some(e => e.exception_date === dateStr);
        if (isException) return [];

        return blocks.filter(b => {
            if (b.is_exception) return false;
            if (b.date === dateStr) return true;
            if (b.is_recurring && b.recurring_days?.includes(dayOfWeek)) return true;
            return false;
        });
    };

    // Handle adding a new block
    const handleAddBlock = async () => {
        if (!blockLabel.trim()) return;
        const dateStr = selectedDate
            ? `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`
            : null;
        try {
            await addScheduleBlock({
                date: blockRecurring ? null : dateStr,
                start_time: blockStart,
                end_time: blockEnd,
                label: blockLabel.trim(),
                color: blockColor,
                block_type: blockType,
                is_recurring: blockRecurring,
                recurring_days: blockRecurring ? blockDays : [],
            });
            setShowAddBlock(false);
            setBlockLabel('');
            loadMonthData();
        } catch (err) {
            console.error('Failed to add block', err);
        }
    };

    // Handle marking exception
    const handleMarkException = async (day) => {
        const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        try {
            await addScheduleException(null, dateStr);
            loadMonthData();
        } catch (err) {
            console.error('Failed to mark exception', err);
        }
    };

    // Handle adding a task
    const handleAddTask = async () => {
        if (!newTaskTitle.trim()) return;
        try {
            await addScheduleTask(newTaskTitle.trim(), newTaskDuration);
            setNewTaskTitle('');
            setNewTaskDuration('medium');
            loadMonthData();
        } catch (err) {
            console.error('Failed to add task', err);
        }
    };

    // Handle saving sleep log
    const handleSaveSleep = async () => {
        if (!selectedDate) return;
        const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;
        try {
            const wakeISO = new Date(`${dateStr}T${wakeTimeInput}:00`).toISOString();
            const sleepISO = new Date(`${dateStr}T${sleepTimeInput}:00`).toISOString();
            await upsertSleepLog(dateStr, wakeISO, sleepISO);
            setSleepLog({ wake_time: wakeISO, sleep_time: sleepISO });
            setShowSleepInput(false);
            loadMonthData();
        } catch (err) {
            console.error('Failed to save sleep log', err);
        }
    };

    // Apple Health XML import
    const handleHealthImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, 'text/xml');
            const records = xml.querySelectorAll('Record[type="HKCategoryTypeIdentifierSleepAnalysis"]');
            const sleepMap = {};
            records.forEach(record => {
                const start = new Date(record.getAttribute('startDate'));
                const end = new Date(record.getAttribute('endDate'));
                const dateKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
                if (!sleepMap[dateKey]) {
                    sleepMap[dateKey] = { date: dateKey, sleep_time: start.toISOString(), wake_time: end.toISOString() };
                } else {
                    if (start < new Date(sleepMap[dateKey].sleep_time)) sleepMap[dateKey].sleep_time = start.toISOString();
                    if (end > new Date(sleepMap[dateKey].wake_time)) sleepMap[dateKey].wake_time = end.toISOString();
                }
            });
            const logs = Object.values(sleepMap);
            if (logs.length > 0) {
                await importSleepLogs(logs);
                loadMonthData();
                setShowImport(false);
                alert(`Imported sleep data for ${logs.length} days!`);
            } else {
                alert('No sleep data found in the file.');
            }
        } catch (err) {
            console.error('Failed to parse health data', err);
            alert('Failed to parse the file. Make sure it\'s an Apple Health export XML.');
        }
    };

    // AI schedule helper
    const handleAISchedule = async (task) => {
        if (!hasApiKey()) { setAiResponse('No Gemini API key. Add one in Settings.'); return; }
        setAiLoading(true);
        try {
            const context = buildScheduleContext();
            const msg = `I need to schedule this task: "${task.title}" (estimated: ${task.duration_estimate}). Look at my schedule and suggest the best available time slot. If the best day seems full, let me know and suggest an alternative. Be specific about day and time.`;
            const response = await chatWithAgent(msg, context);
            setAiResponse(response);
        } catch (err) {
            setAiResponse(`Error: ${err.message}`);
        }
        setAiLoading(false);
    };

    const handleAIChat = async () => {
        if (!aiMessage.trim() || aiLoading) return;
        if (!hasApiKey()) { setAiResponse('No Gemini API key. Add one in Settings.'); return; }
        setAiLoading(true);
        const msg = aiMessage;
        setAiMessage('');
        try {
            const context = buildScheduleContext();
            const response = await chatWithAgent(msg, context);
            setAiResponse(response);
        } catch (err) {
            setAiResponse(`Error: ${err.message}`);
        }
        setAiLoading(false);
    };

    const buildScheduleContext = () => {
        const blocksSummary = blocks.slice(0, 20).map(b => {
            if (b.is_recurring) return `Recurring ${b.label}: ${b.start_time}-${b.end_time} on days ${b.recurring_days?.join(',')}`;
            return `${b.date}: ${b.label} ${b.start_time}-${b.end_time}`;
        }).join('\n');
        const tasksSummary = tasks.filter(t => t.status !== 'done').map(t =>
            `Task: "${t.title}" (${t.duration_estimate})${t.scheduled_date ? ` - scheduled ${t.scheduled_date}` : ' - unscheduled'}`
        ).join('\n');
        const ruleSummary = autoClockRules.map(r =>
            `Auto-clock: ${r.companies?.name || 'Job'} on day ${r.day_of_week} at ${r.start_time}`
        ).join('\n');
        return `SCHEDULE BLOCKS:\n${blocksSummary || 'None'}\n\nPENDING TASKS:\n${tasksSummary || 'None'}\n\nAUTO-CLOCK RULES:\n${ruleSummary || 'None'}\n\nCurrent date: ${today.toLocaleDateString()}\nCurrent month view: ${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;
    };

    // Timeline rendering — compact strip + session list
    const selectedDayBlocks = getSelectedDayBlocks();
    const selectedDateStr = selectedDate
        ? `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`
        : null;
    const selectedDayTasks = tasks.filter(t => t.scheduled_date === selectedDateStr);

    // Determine if selected date is past, today, or future
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const isPast = selectedDateStr && selectedDateStr < todayStr;
    const isToday2 = selectedDateStr === todayStr;
    const isFuture = selectedDateStr && selectedDateStr > todayStr;

    // Build timeline items — merge only CONSECUTIVE sessions of the same task
    const buildTimelineItems = () => {
        const timelineBlocks = []; // for the compact strip
        const listItems = [];     // for the session list

        // 1. Sleep blocks
        if (sleepLog) {
            const wakeTime = sleepLog.wake_time ? new Date(sleepLog.wake_time) : null;
            const sleepTime = sleepLog.sleep_time ? new Date(sleepLog.sleep_time) : null;
            if (wakeTime) {
                const wakeMins = wakeTime.getHours() * 60 + wakeTime.getMinutes();
                if (wakeMins > 0) {
                    const block = { id: 'sleep-am', type: 'sleep', startMins: 0, endMins: wakeMins, label: 'Sleep', color: '#1e1b4b' };
                    timelineBlocks.push(block);
                    listItems.push({ ...block, timeStr: `12:00 AM → ${minutesToTime(wakeMins)}`, durationMins: wakeMins, companyName: 'Sleep', sessions: [] });
                }
            }
            if (sleepTime) {
                const sleepMins = sleepTime.getHours() * 60 + sleepTime.getMinutes();
                if (sleepMins > 0) {
                    const block = { id: 'sleep-pm', type: 'sleep', startMins: sleepMins, endMins: 1440, label: 'Sleep', color: '#1e1b4b' };
                    timelineBlocks.push(block);
                    listItems.push({ ...block, timeStr: `${minutesToTime(sleepMins)} → 12:00 AM`, durationMins: 1440 - sleepMins, companyName: 'Sleep', sessions: [] });
                }
            }
        }

        // 2. Actual sessions — merge consecutive only (within 5 min gap)
        if (isPast || isToday2) {
            // Sort sessions by start time
            const sorted = [...daySessions].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
            const merged = [];

            sorted.forEach(session => {
                const taskName = session.tasks?.name || session.projects?.name || 'Session';
                const color = session.companies?.color || '#6366f1';
                const companyName = session.companies?.name || '';
                const start = new Date(session.start_time);
                const end = session.end_time ? new Date(session.end_time) : new Date();
                const dayStart = new Date(`${selectedDateStr}T00:00:00`);
                const dayEnd = new Date(`${selectedDateStr}T23:59:59`);
                const effectiveStart = start < dayStart ? dayStart : start;
                const effectiveEnd = end > dayEnd ? dayEnd : end;
                const startMins = effectiveStart.getHours() * 60 + effectiveStart.getMinutes();
                const endMins = Math.max(effectiveEnd.getHours() * 60 + effectiveEnd.getMinutes(), startMins + 2);

                // Check if this session can merge with the last merged block
                const last = merged.length > 0 ? merged[merged.length - 1] : null;
                if (last && last.taskName === taskName && last.color === color && startMins <= last.endMins + 5) {
                    // Merge — extend the block
                    last.endMins = Math.max(last.endMins, endMins);
                    last.sessions.push(session);
                } else {
                    // New block
                    merged.push({
                        taskName, color, companyName, startMins, endMins,
                        sessions: [session],
                    });
                }
            });

            merged.forEach((m, i) => {
                const totalMins = m.sessions.reduce((sum, s) => {
                    const st = new Date(s.start_time);
                    const en = s.end_time ? new Date(s.end_time) : new Date();
                    return sum + (en - st) / 60000;
                }, 0);
                const block = {
                    id: `session-${i}`, type: 'actual',
                    startMins: m.startMins, endMins: m.endMins,
                    label: m.taskName, color: m.color,
                };
                timelineBlocks.push(block);
                listItems.push({
                    ...block,
                    companyName: m.companyName,
                    timeStr: `${minutesToTime(m.startMins)} → ${minutesToTime(m.endMins)}`,
                    durationMins: Math.round(totalMins),
                    sessionCount: m.sessions.length,
                    sessions: m.sessions,
                });
            });
        }

        // 3. Planned blocks (today & future)
        if (isToday2 || isFuture) {
            selectedDayBlocks.forEach((block, i) => {
                const startMins = parseTimeToMinutes(block.start_time);
                const endMins = parseTimeToMinutes(block.end_time);
                const tb = { id: `block-${i}`, type: 'planned', startMins, endMins, label: block.label, color: block.color || '#6366f1' };
                timelineBlocks.push(tb);
                listItems.push({ ...tb, companyName: 'Planned', timeStr: `${block.start_time} → ${block.end_time}`, durationMins: endMins - startMins, sessions: [] });
            });
        }

        // 4. Scheduled tasks (today & future)
        if (isToday2 || isFuture) {
            selectedDayTasks.forEach((task, i) => {
                if (!task.scheduled_start_time) return;
                const startMins = parseTimeToMinutes(task.scheduled_start_time);
                const durMins = DURATION_MINUTES[task.duration_estimate] || 45;
                const dOpt = DURATION_OPTIONS.find(d => d.value === task.duration_estimate);
                const tb = { id: `task-${i}`, type: 'task', startMins, endMins: startMins + durMins, label: task.title, color: dOpt?.color || '#6366f1' };
                timelineBlocks.push(tb);
                listItems.push({ ...tb, companyName: 'Scheduled', timeStr: `${task.scheduled_start_time} → ${minutesToTime(startMins + durMins)}`, durationMins: durMins, sessions: [] });
            });
        }

        // Sort timeline blocks and list items by start time
        timelineBlocks.sort((a, b) => a.startMins - b.startMins);
        listItems.sort((a, b) => a.startMins - b.startMins);

        // Get unique companies for filter chips
        const companySet = new Map();
        listItems.forEach(item => {
            if (item.companyName && !companySet.has(item.companyName)) {
                companySet.set(item.companyName, item.color);
            }
        });

        return { timelineBlocks, listItems, companies: Array.from(companySet, ([name, color]) => ({ name, color })) };
    };

    const timelineData = selectedDate ? buildTimelineItems() : { timelineBlocks: [], listItems: [], companies: [] };
    const filteredListItems = filterCompany === 'all'
        ? timelineData.listItems
        : timelineData.listItems.filter(it => it.companyName === filterCompany);

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
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2><Icon name="calendar" size={24} className="icon-inline" /> Schedule</h2>
                    <p>Plan your week, track your day</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowAddBlock(true)}>
                        <Icon name="plus" size={14} /> Add Block
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(!showImport)}>
                        <Icon name="upload" size={14} /> Import Sleep
                    </button>
                </div>
            </div>

            {/* Apple Health Import */}
            {showImport && (
                <div className="card" style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Icon name="upload" size={16} /> Import Apple Health Sleep Data
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        Export your health data from iPhone (Settings → Health → Export All Health Data), then upload the <code>export.xml</code> file here. Sleep data will be automatically parsed and added to your timeline.
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xml"
                        onChange={handleHealthImport}
                        style={{ display: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()}>
                            <Icon name="upload" size={14} /> Choose XML File
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {/* Add Block Modal */}
            {showAddBlock && (
                <div className="card" style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px' }}>New Schedule Block</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div className="input-group">
                            <label>Label</label>
                            <input className="input" placeholder="e.g. Physical Job" value={blockLabel} onChange={e => setBlockLabel(e.target.value)} />
                        </div>
                        <div className="input-group">
                            <label>Type</label>
                            <select className="input" value={blockType} onChange={e => setBlockType(e.target.value)}>
                                <option value="physical_job">Physical Job</option>
                                <option value="planned">Planned</option>
                                <option value="custom">Custom</option>
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Start Time</label>
                            <input className="input" type="time" value={blockStart} onChange={e => setBlockStart(e.target.value)} />
                        </div>
                        <div className="input-group">
                            <label>End Time</label>
                            <input className="input" type="time" value={blockEnd} onChange={e => setBlockEnd(e.target.value)} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={blockRecurring} onChange={e => setBlockRecurring(e.target.checked)} />
                            Recurring weekly
                        </label>
                        <input className="input" type="color" value={blockColor} onChange={e => setBlockColor(e.target.value)} style={{ width: '40px', height: '32px', padding: '2px' }} />
                    </div>
                    {blockRecurring && (
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                            {DAY_NAMES.map((d, i) => (
                                <button
                                    key={i}
                                    className={`duration-chip ${blockDays.includes(i) ? 'active' : ''}`}
                                    style={blockDays.includes(i) ? { background: blockColor, color: '#fff', borderColor: blockColor } : {}}
                                    onClick={() => setBlockDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary btn-sm" onClick={handleAddBlock}>Create Block</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowAddBlock(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {/* ===== MONTHLY CALENDAR ===== */}
            <div className="schedule-calendar card">
                <div className="calendar-header">
                    <button className="btn-icon" onClick={prevMonth}><Icon name="arrow-left" size={18} /></button>
                    <h3 className="calendar-title">{MONTH_NAMES[currentMonth - 1]} {currentYear}</h3>
                    <button className="btn-icon" onClick={nextMonth}><Icon name="arrow-right" size={18} /></button>
                </div>
                <div className="calendar-day-names">
                    {DAY_NAMES.map(d => <div key={d} className="calendar-day-name">{d}</div>)}
                </div>
                <div className="calendar-grid">
                    {/* Empty cells for offset */}
                    {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                        <div key={`empty-${i}`} className="calendar-day empty" />
                    ))}
                    {/* Day cells */}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const info = getDayInfo(day);
                        const isToday = isCurrentMonth && day === todayDate;
                        const isSelected = day === selectedDate;
                        const hasActivity = info.hasSessions || info.hasBlocks || info.hasScheduledTasks;

                        return (
                            <div
                                key={day}
                                className={`calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasActivity ? 'has-activity' : ''} ${info.isException ? 'exception' : ''}`}
                                onClick={() => setSelectedDate(day)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    if (info.hasBlocks && !info.isException) handleMarkException(day);
                                }}
                            >
                                <span className="calendar-day-number">{day}</span>
                                {info.colors.length > 0 && (
                                    <div className="calendar-day-dots">
                                        {info.colors.slice(0, 3).map((c, ci) => (
                                            <span key={ci} className="calendar-dot" style={{ backgroundColor: c }} />
                                        ))}
                                    </div>
                                )}
                                {info.isException && <span className="calendar-exception-mark">✕</span>}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ===== DAY VIEW ===== */}
            {selectedDate && (
                <div className="card" style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Icon name="clock" size={16} />
                            {MONTH_NAMES[currentMonth - 1]} {selectedDate}, {currentYear}
                            {isPast && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Past</span>}
                            {isToday2 && <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 400 }}>Today</span>}
                            {isFuture && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Upcoming</span>}
                        </h3>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowSleepInput(!showSleepInput)}>
                            <Icon name="moon" size={14} /> Sleep
                        </button>
                    </div>

                    {/* Sleep input */}
                    {showSleepInput && (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' }}>
                            <div className="input-group" style={{ minWidth: '120px' }}>
                                <label>Wake Time</label>
                                <input className="input" type="time" value={wakeTimeInput} onChange={e => setWakeTimeInput(e.target.value)} />
                            </div>
                            <div className="input-group" style={{ minWidth: '120px' }}>
                                <label>Sleep Time</label>
                                <input className="input" type="time" value={sleepTimeInput} onChange={e => setSleepTimeInput(e.target.value)} />
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={handleSaveSleep}>Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowSleepInput(false)}>Cancel</button>
                        </div>
                    )}




                    {/* ===== FILTER CHIPS ===== */}
                    {timelineData.companies.length > 1 && (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
                            <button
                                className={`session-filter-chip ${filterCompany === 'all' ? 'active' : ''}`}
                                onClick={() => setFilterCompany('all')}
                            >
                                All
                            </button>
                            {timelineData.companies.map(c => (
                                <button
                                    key={c.name}
                                    className={`session-filter-chip ${filterCompany === c.name ? 'active' : ''}`}
                                    style={filterCompany === c.name ? { backgroundColor: c.color, borderColor: c.color, color: '#fff' } : { borderColor: c.color, color: c.color }}
                                    onClick={() => setFilterCompany(filterCompany === c.name ? 'all' : c.name)}
                                >
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: c.color, flexShrink: 0 }} />
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ===== SESSION LIST ===== */}
                    <div className="session-list" style={{ marginTop: '16px' }}>
                        {filteredListItems.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                {isFuture ? 'No scheduled items for this day' : 'No sessions recorded'}
                            </div>
                        )}
                        {filteredListItems.map(item => {
                            const isExpanded = expandedBlock === item.id;
                            const durStr = item.durationMins >= 60
                                ? `${Math.floor(item.durationMins / 60)}h ${item.durationMins % 60}m`
                                : `${item.durationMins}m`;
                            const isSleep = item.type === 'sleep';
                            return (
                                <div key={item.id}>
                                    <div
                                        className={`session-list-item ${isExpanded ? 'expanded' : ''} ${isSleep ? 'sleep' : ''}`}
                                        onClick={() => item.sessions?.length > 0 && setExpandedBlock(isExpanded ? null : item.id)}
                                        style={{ cursor: item.sessions?.length > 0 ? 'pointer' : 'default' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                            <div className="session-color-dot" style={{ backgroundColor: item.color }} />
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div className="session-list-name">{item.label}</div>
                                                <div className="session-list-meta">
                                                    {item.companyName}
                                                    {item.sessionCount > 1 && ` • ${item.sessionCount} sessions`}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div className="session-list-time">{item.timeStr}</div>
                                            <div className="session-list-duration">{durStr}</div>
                                        </div>
                                    </div>
                                    {/* Expanded session details */}
                                    {isExpanded && item.sessions?.length > 0 && (
                                        <div className="session-detail-expand">
                                            {item.sessions.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)).map((session, si) => {
                                                const s = new Date(session.start_time);
                                                const e = session.end_time ? new Date(session.end_time) : null;
                                                const dur = e ? Math.round((e - s) / 60000) : 0;
                                                const ds = dur >= 60 ? `${Math.floor(dur / 60)}h ${dur % 60}m` : `${dur}m`;
                                                return (
                                                    <div key={si} className="session-detail-row">
                                                        <span>
                                                            {s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            {e ? ` → ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' → Active'}
                                                        </span>
                                                        <span>{ds}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ===== TASK NOTEPAD + AI SCHEDULER ===== */}
            <div className="card" style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name="clipboard" size={16} /> Task Notepad
                </h3>

                {/* Add task input */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="input-group" style={{ flex: 1, minWidth: '200px' }}>
                        <label>What needs to get done?</label>
                        <input
                            className="input"
                            placeholder="e.g. Update Gaga Leads mobile app..."
                            value={newTaskTitle}
                            onChange={e => setNewTaskTitle(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {DURATION_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                className={`duration-chip ${newTaskDuration === opt.value ? 'active' : ''}`}
                                style={newTaskDuration === opt.value ? { background: opt.color, color: '#fff', borderColor: opt.color } : {}}
                                onClick={() => setNewTaskDuration(opt.value)}
                                title={opt.value === 'unknown' ? 'Unknown duration' : `${opt.label} task`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={handleAddTask}>Add</button>
                </div>

                {/* Task list */}
                <div className="task-notepad-list">
                    {tasks.filter(t => t.status !== 'done').length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            No pending tasks. Add one above!
                        </div>
                    ) : (
                        tasks.filter(t => t.status !== 'done').map(task => {
                            const dOpt = DURATION_OPTIONS.find(d => d.value === task.duration_estimate);
                            return (
                                <div key={task.id} className="task-notepad-item">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                        <button
                                            className="btn-icon"
                                            style={{ color: 'var(--color-success)' }}
                                            onClick={async () => {
                                                await updateScheduleTask(task.id, { status: 'done', completed_at: new Date().toISOString() });
                                                loadMonthData();
                                            }}
                                            title="Mark done"
                                        >
                                            <Icon name="check" size={14} />
                                        </button>
                                        <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {task.title}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                        <span
                                            className="duration-chip active"
                                            style={{ background: dOpt?.color || '#6366f1', color: '#fff', borderColor: dOpt?.color || '#6366f1', cursor: 'default', fontSize: '0.7rem', padding: '2px 8px' }}
                                        >
                                            {dOpt?.label || '?'}
                                        </span>
                                        {task.scheduled_date && (
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                                                {new Date(task.scheduled_date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                            </span>
                                        )}
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                                            onClick={() => handleAISchedule(task)}
                                            disabled={aiLoading}
                                        >
                                            <Icon name="sparkle" size={10} /> Schedule
                                        </button>
                                        <button
                                            className="btn-icon"
                                            style={{ color: 'var(--color-danger)' }}
                                            onClick={async () => {
                                                await deleteScheduleTask(task.id);
                                                loadMonthData();
                                            }}
                                        >
                                            <Icon name="close" size={12} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ===== AI SCHEDULER CHAT ===== */}
            <div className="card" style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name="brain" size={16} /> AI Schedule Assistant
                </h3>

                {aiResponse && (
                    <div className="ai-message assistant" style={{ marginBottom: '12px', whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
                        {aiResponse}
                    </div>
                )}

                <div className="ai-input-row">
                    <input
                        className="input"
                        placeholder="Ask AI to help schedule tasks, compress your day, or find open slots..."
                        value={aiMessage}
                        onChange={e => setAiMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAIChat()}
                        disabled={aiLoading}
                    />
                    <button className="btn btn-primary" onClick={handleAIChat} disabled={aiLoading || !aiMessage.trim()}>
                        {aiLoading ? <Icon name="hourglass" size={14} /> : 'Send'}
                    </button>
                </div>
            </div>
        </AppLayout>
    );
}
