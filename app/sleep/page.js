'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { getAllSleepLogs, upsertSleepLog, deleteSleepLog } from '@/lib/store';

const PHASE_COLORS = {
    deep: '#6d28d9',    // purple
    core: '#2563eb',    // blue
    rem: '#06b6d4',     // cyan
    awake: '#ef4444',   // red
};

function PhaseBar({ log }) {
    const rem = log.rem_mins || 0;
    const core = log.core_mins || 0;
    const deep = log.deep_mins || 0;
    const awake = log.awake_mins || 0;
    const total = rem + core + deep + awake;
    if (total <= 0) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
            <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', gap: '1px' }}>
                {deep > 0 && (
                    <div
                        style={{ width: `${(deep / total) * 100}%`, backgroundColor: PHASE_COLORS.deep, minWidth: '4px' }}
                        title={`Deep: ${deep}m`}
                    />
                )}
                {core > 0 && (
                    <div
                        style={{ width: `${(core / total) * 100}%`, backgroundColor: PHASE_COLORS.core, minWidth: '4px' }}
                        title={`Core: ${core}m`}
                    />
                )}
                {rem > 0 && (
                    <div
                        style={{ width: `${(rem / total) * 100}%`, backgroundColor: PHASE_COLORS.rem, minWidth: '4px' }}
                        title={`REM: ${rem}m`}
                    />
                )}
                {awake > 0 && (
                    <div
                        style={{ width: `${(awake / total) * 100}%`, backgroundColor: PHASE_COLORS.awake, minWidth: '4px' }}
                        title={`Awake: ${awake}m`}
                    />
                )}
            </div>
            <div style={{ display: 'flex', gap: '10px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {deep > 0 && <span style={{ color: PHASE_COLORS.deep }}>Deep {deep}m</span>}
                {core > 0 && <span style={{ color: PHASE_COLORS.core }}>Core {core}m</span>}
                {rem > 0 && <span style={{ color: PHASE_COLORS.rem }}>REM {rem}m</span>}
                {awake > 0 && <span style={{ color: PHASE_COLORS.awake }}>Awake {awake}m</span>}
            </div>
        </div>
    );
}

export default function SleepPage() {
    const [sleepLogs, setSleepLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [expandedLog, setExpandedLog] = useState(null);
    const [syncStatus, setSyncStatus] = useState(null);
    const [syncLoading, setSyncLoading] = useState(false);

    // Form
    const [formDate, setFormDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [formWake, setFormWake] = useState('06:30');
    const [formSleep, setFormSleep] = useState('22:00');
    const [formRem, setFormRem] = useState('');
    const [formCore, setFormCore] = useState('');
    const [formDeep, setFormDeep] = useState('');
    const [formAwake, setFormAwake] = useState('');

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            const logs = await getAllSleepLogs(90);
            setSleepLogs(logs);
        } catch (err) {
            console.error('Failed to load sleep logs', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    const handleAddSleep = async () => {
        if (!formDate) return;
        try {
            const wakeISO = new Date(`${formDate}T${formWake}:00`).toISOString();
            const sleepISO = new Date(`${formDate}T${formSleep}:00`).toISOString();
            await upsertSleepLog(formDate, wakeISO, sleepISO, 'manual');
            setShowAdd(false);
            loadLogs();
        } catch (err) {
            console.error('Failed to save sleep log', err);
            alert('Error saving sleep log: ' + err.message);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this sleep log?')) return;
        try {
            await deleteSleepLog(id);
            loadLogs();
        } catch (err) {
            console.error('Failed to delete', err);
        }
    };

    const handleTestSync = async () => {
        setSyncLoading(true);
        setSyncStatus(null);
        try {
            const res = await fetch('/api/sleep-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: 'test-ping' }),
            });
            const data = await res.json();
            setSyncStatus({
                ok: res.ok,
                status: res.status,
                data,
                timestamp: new Date().toLocaleString(),
            });
        } catch (err) {
            setSyncStatus({
                ok: false,
                status: 0,
                data: { error: err.message },
                timestamp: new Date().toLocaleString(),
            });
        }
        setSyncLoading(false);
    };

    const formatTime = (iso) => {
        if (!iso) return '-';
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const calcDuration = (wake, sleep) => {
        if (!wake || !sleep) return '-';
        const w = new Date(wake);
        const s = new Date(sleep);
        let diff;
        if (w > s) {
            diff = (w - s) / 60000;
        } else {
            diff = (24 * 60) - (s - w) / 60000;
        }
        if (diff < 0 || diff > 24 * 60) return '-';
        const h = Math.floor(diff / 60);
        const m = Math.round(diff % 60);
        return `${h}h ${m}m`;
    };

    // Compute averages
    const recentLogs = sleepLogs.slice(0, 7);
    const avgTotal = recentLogs.length > 0
        ? Math.round(recentLogs.reduce((sum, l) => sum + (l.total_sleep_mins || 0), 0) / recentLogs.length)
        : 0;
    const avgRem = recentLogs.length > 0
        ? Math.round(recentLogs.reduce((sum, l) => sum + (l.rem_mins || 0), 0) / recentLogs.length)
        : 0;
    const avgDeep = recentLogs.length > 0
        ? Math.round(recentLogs.reduce((sum, l) => sum + (l.deep_mins || 0), 0) / recentLogs.length)
        : 0;

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
                    <h2><Icon name="moon" size={24} className="icon-inline" /> Sleep</h2>
                    <p>Track and verify your sleep data</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-ghost btn-sm" onClick={handleTestSync} disabled={syncLoading}>
                        <Icon name="refresh" size={14} /> {syncLoading ? 'Testing...' : 'Test API'}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}>
                        <Icon name="plus" size={14} /> Add Entry
                    </button>
                </div>
            </div>

            {/* 7-day averages */}
            {(avgTotal > 0 || avgRem > 0 || avgDeep > 0) && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    {avgTotal > 0 && (
                        <div className="card" style={{ flex: 1, minWidth: '130px', textAlign: 'center', padding: '14px' }}>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>7-Day Avg Sleep</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{Math.floor(avgTotal / 60)}h {avgTotal % 60}m</div>
                        </div>
                    )}
                    {avgDeep > 0 && (
                        <div className="card" style={{ flex: 1, minWidth: '130px', textAlign: 'center', padding: '14px' }}>
                            <div style={{ fontSize: '0.72rem', color: PHASE_COLORS.deep, marginBottom: '4px' }}>Avg Deep</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: PHASE_COLORS.deep }}>{avgDeep}m</div>
                        </div>
                    )}
                    {avgRem > 0 && (
                        <div className="card" style={{ flex: 1, minWidth: '130px', textAlign: 'center', padding: '14px' }}>
                            <div style={{ fontSize: '0.72rem', color: PHASE_COLORS.rem, marginBottom: '4px' }}>Avg REM</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: PHASE_COLORS.rem }}>{avgRem}m</div>
                        </div>
                    )}
                </div>
            )}

            {/* API Sync Status */}
            {syncStatus && (
                <div className="card" style={{ marginBottom: '16px', borderLeft: `4px solid ${syncStatus.ok ? 'var(--color-success)' : 'var(--color-danger)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: syncStatus.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                {syncStatus.ok ? '✓' : '✗'}
                            </span>
                            API Response - {syncStatus.status}
                        </h3>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{syncStatus.timestamp}</span>
                    </div>
                    <pre style={{
                        background: 'var(--bg-input)',
                        padding: '10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.78rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        color: 'var(--text-secondary)',
                        overflowX: 'auto',
                        margin: 0,
                    }}>
                        {JSON.stringify(syncStatus.data, null, 2)}
                    </pre>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                        Tests /api/sleep-sync with an invalid token. A 401 response means the API is working.
                    </p>
                </div>
            )}

            {/* Add Sleep Form */}
            {showAdd && (
                <div className="card" style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px' }}>
                        <Icon name="plus" size={14} /> Add Sleep Entry
                    </h3>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="input-group" style={{ minWidth: '140px' }}>
                            <label>Date</label>
                            <input className="input" type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
                        </div>
                        <div className="input-group" style={{ minWidth: '110px' }}>
                            <label>Wake Time</label>
                            <input className="input" type="time" value={formWake} onChange={e => setFormWake(e.target.value)} />
                        </div>
                        <div className="input-group" style={{ minWidth: '110px' }}>
                            <label>Sleep Time</label>
                            <input className="input" type="time" value={formSleep} onChange={e => setFormSleep(e.target.value)} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'flex-end' }}>
                        <div className="input-group" style={{ minWidth: '80px', maxWidth: '100px' }}>
                            <label style={{ fontSize: '0.72rem', color: PHASE_COLORS.deep }}>Deep (min)</label>
                            <input className="input" type="number" value={formDeep} onChange={e => setFormDeep(e.target.value)} placeholder="0" />
                        </div>
                        <div className="input-group" style={{ minWidth: '80px', maxWidth: '100px' }}>
                            <label style={{ fontSize: '0.72rem', color: PHASE_COLORS.core }}>Core (min)</label>
                            <input className="input" type="number" value={formCore} onChange={e => setFormCore(e.target.value)} placeholder="0" />
                        </div>
                        <div className="input-group" style={{ minWidth: '80px', maxWidth: '100px' }}>
                            <label style={{ fontSize: '0.72rem', color: PHASE_COLORS.rem }}>REM (min)</label>
                            <input className="input" type="number" value={formRem} onChange={e => setFormRem(e.target.value)} placeholder="0" />
                        </div>
                        <div className="input-group" style={{ minWidth: '80px', maxWidth: '100px' }}>
                            <label style={{ fontSize: '0.72rem', color: PHASE_COLORS.awake }}>Awake (min)</label>
                            <input className="input" type="number" value={formAwake} onChange={e => setFormAwake(e.target.value)} placeholder="0" />
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={handleAddSleep}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {/* Sleep Logs */}
            <div className="card">
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name="clipboard" size={16} /> Sleep Log ({sleepLogs.length} entries)
                </h3>

                {sleepLogs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                        <Icon name="moon" size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
                        <p style={{ fontSize: '0.9rem' }}>No sleep data yet</p>
                        <p style={{ fontSize: '0.78rem', marginTop: '4px' }}>Add entries manually or sync via the iOS Shortcut</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {sleepLogs.map(log => {
                            const dur = calcDuration(log.wake_time, log.sleep_time);
                            const totalPhase = (log.rem_mins || 0) + (log.core_mins || 0) + (log.deep_mins || 0) + (log.awake_mins || 0);
                            const hasPhases = totalPhase > 0;
                            const isExpanded = expandedLog === log.id;
                            const sourceColor = log.source === 'apple_health' ? '#34d399'
                                : log.source === 'ios_shortcut' ? '#60a5fa'
                                : log.source === 'agent' ? '#a78bfa'
                                : '#94a3b8';
                            return (
                                <div key={log.id}>
                                    <div
                                        className={`session-list-item ${isExpanded ? 'expanded' : ''}`}
                                        onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                                        style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px' }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                                <div className="session-color-dot" style={{ backgroundColor: '#1e1b4b' }} />
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                                        {new Date(log.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        {formatTime(log.sleep_time)} → {formatTime(log.wake_time)}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem', fontWeight: 700 }}>
                                                        {log.total_sleep_mins > 0
                                                            ? `${Math.floor(log.total_sleep_mins / 60)}h ${log.total_sleep_mins % 60}m`
                                                            : dur}
                                                    </div>
                                                </div>
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 8px',
                                                    borderRadius: '10px',
                                                    backgroundColor: `${sourceColor}22`,
                                                    color: sourceColor,
                                                    fontWeight: 600,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {log.source || 'manual'}
                                                </span>
                                                <button
                                                    className="btn-icon"
                                                    style={{ color: 'var(--color-danger)', opacity: 0.4 }}
                                                    onClick={e => { e.stopPropagation(); handleDelete(log.id); }}
                                                    title="Delete"
                                                >
                                                    <Icon name="close" size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        {hasPhases && <PhaseBar log={log} />}
                                    </div>

                                    {/* Expanded details */}
                                    {isExpanded && (
                                        <div className="session-detail-expand">
                                            <div className="session-detail-row">
                                                <span>Bedtime</span>
                                                <span>{formatTime(log.sleep_time)}</span>
                                            </div>
                                            <div className="session-detail-row">
                                                <span>Wake Time</span>
                                                <span>{formatTime(log.wake_time)}</span>
                                            </div>
                                            {hasPhases && (
                                                <>
                                                    <div className="session-detail-row" style={{ color: PHASE_COLORS.deep }}>
                                                        <span>🟣 Deep Sleep</span>
                                                        <span>{log.deep_mins || 0} min</span>
                                                    </div>
                                                    <div className="session-detail-row" style={{ color: PHASE_COLORS.core }}>
                                                        <span>🔵 Core Sleep</span>
                                                        <span>{log.core_mins || 0} min</span>
                                                    </div>
                                                    <div className="session-detail-row" style={{ color: PHASE_COLORS.rem }}>
                                                        <span>🩵 REM Sleep</span>
                                                        <span>{log.rem_mins || 0} min</span>
                                                    </div>
                                                    <div className="session-detail-row" style={{ color: PHASE_COLORS.awake }}>
                                                        <span>🔴 Awake</span>
                                                        <span>{log.awake_mins || 0} min</span>
                                                    </div>
                                                </>
                                            )}
                                            <div className="session-detail-row" style={{ opacity: 0.6 }}>
                                                <span>Source</span>
                                                <span>{log.source || 'manual'}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Shortcut Instructions */}
            <div className="card" style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name="settings" size={14} /> iOS Shortcut Setup
                </h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <p><strong>Endpoint:</strong> <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '3px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem' }}>POST /api/sleep-sync</code></p>

                    <p style={{ marginTop: '12px' }}><strong>Shortcut Steps:</strong></p>
                    <ol style={{ paddingLeft: '20px', fontSize: '0.78rem', lineHeight: 1.8, color: 'var(--text-muted)' }}>
                        <li>Find Health Samples → Type: <strong>In Bed</strong> → Last 1 day → Sort: Start Date, Latest → Limit 1</li>
                        <li>Find Health Samples → Type: <strong>Sleep</strong> → where Value is <strong>Deep</strong> → Last 1 day</li>
                        <li>Calculate → <strong>Duration</strong> of each Deep sample → Sum all</li>
                        <li>Repeat for <strong>Core</strong>, <strong>REM</strong>, and <strong>Awake</strong></li>
                        <li>POST to /api/sleep-sync with:</li>
                    </ol>
                    <pre style={{
                        background: 'var(--bg-input)',
                        padding: '10px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        marginTop: '4px',
                        overflowX: 'auto',
                    }}>{`{
  "token": "your-agent-token",
  "date": "2026-03-23",
  "wake_time": "06:30",
  "sleep_time": "23:15",
  "rem_mins": 85,
  "core_mins": 140,
  "deep_mins": 55,
  "awake_mins": 12
}`}</pre>
                </div>
            </div>
        </AppLayout>
    );
}
