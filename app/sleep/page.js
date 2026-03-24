'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { getAllSleepLogs, upsertSleepLog, deleteSleepLog } from '@/lib/store';

export default function SleepPage() {
    const [sleepLogs, setSleepLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [syncLoading, setSyncLoading] = useState(false);

    // Form
    const [formDate, setFormDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [formWake, setFormWake] = useState('06:30');
    const [formSleep, setFormSleep] = useState('22:00');

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
                body: JSON.stringify({
                    token: 'test-ping',  // intentionally invalid to test the API response
                }),
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
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const calcDuration = (wake, sleep) => {
        if (!wake || !sleep) return '—';
        const w = new Date(wake);
        const s = new Date(sleep);
        // Sleep might be previous day
        let diff;
        if (w > s) {
            // Normal: slept last night, woke this morning
            diff = (w - s) / 60000;
        } else {
            // Same day (nap or weird data)
            diff = (24 * 60) - (s - w) / 60000;
        }
        if (diff < 0 || diff > 24 * 60) return '—';
        const h = Math.floor(diff / 60);
        const m = Math.round(diff % 60);
        return `${h}h ${m}m`;
    };

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

            {/* API Sync Status */}
            {syncStatus && (
                <div className="card" style={{ marginBottom: '16px', borderLeft: `4px solid ${syncStatus.ok ? 'var(--color-success)' : 'var(--color-danger)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: syncStatus.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                {syncStatus.ok ? '✓' : '✗'}
                            </span>
                            API Response — {syncStatus.status}
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
                        This tests the /api/sleep-sync endpoint with an invalid token to verify the API is reachable.
                        A 401 "Invalid token" response means the API is working correctly.
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
                        <div className="input-group" style={{ minWidth: '120px' }}>
                            <label>Wake Time</label>
                            <input className="input" type="time" value={formWake} onChange={e => setFormWake(e.target.value)} />
                        </div>
                        <div className="input-group" style={{ minWidth: '120px' }}>
                            <label>Sleep Time</label>
                            <input className="input" type="time" value={formSleep} onChange={e => setFormSleep(e.target.value)} />
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
                        {/* Header */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '120px 1fr 1fr 90px 80px 50px',
                            gap: '8px',
                            padding: '8px 12px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>
                            <span>Date</span>
                            <span>Wake</span>
                            <span>Sleep</span>
                            <span>Duration</span>
                            <span>Source</span>
                            <span></span>
                        </div>

                        {sleepLogs.map(log => {
                            const dur = calcDuration(log.wake_time, log.sleep_time);
                            const sourceColor = log.source === 'apple_health' ? '#34d399'
                                : log.source === 'ios_shortcut' ? '#60a5fa'
                                : log.source === 'agent' ? '#a78bfa'
                                : '#94a3b8';
                            return (
                                <div
                                    key={log.id}
                                    className="session-list-item"
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '120px 1fr 1fr 90px 80px 50px',
                                        gap: '8px',
                                        alignItems: 'center',
                                    }}
                                >
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                        {new Date(log.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        {formatTime(log.wake_time)}
                                    </span>
                                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        {formatTime(log.sleep_time)}
                                    </span>
                                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem', fontWeight: 600 }}>
                                        {dur}
                                    </span>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        padding: '2px 8px',
                                        borderRadius: '10px',
                                        backgroundColor: `${sourceColor}22`,
                                        color: sourceColor,
                                        fontWeight: 600,
                                        textAlign: 'center',
                                    }}>
                                        {log.source || 'manual'}
                                    </span>
                                    <button
                                        className="btn-icon"
                                        style={{ color: 'var(--color-danger)', opacity: 0.5 }}
                                        onClick={() => handleDelete(log.id)}
                                        title="Delete"
                                    >
                                        <Icon name="close" size={14} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* API Info */}
            <div className="card" style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name="settings" size={14} /> iOS Shortcut Sync
                </h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <p><strong>Endpoint:</strong> <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '3px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem' }}>POST /api/sleep-sync</code></p>
                    <p style={{ marginTop: '8px' }}><strong>Body:</strong></p>
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
  "sleep_time": "22:15"
}`}</pre>
                    <p style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        Run your iOS Shortcut each morning to auto-sync. Entries are upserted by date (one entry per day).
                    </p>
                </div>
            </div>
        </AppLayout>
    );
}
