'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { hasApiKey, setApiKey, clearApiKey } from '@/lib/gemini';
import { getSessions, exportSessionsToCSV, downloadCSV } from '@/lib/store';

export default function SettingsPage() {
    const [apiKey, setApiKeyState] = useState('');
    const [hasKey, setHasKey] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const key = typeof window !== 'undefined' ? localStorage.getItem('focusarch_gemini_key') || '' : '';
        setApiKeyState(key);
        setHasKey(hasApiKey());
    }, []);

    const handleSaveKey = () => {
        if (apiKey.trim()) {
            setApiKey(apiKey.trim());
            setHasKey(true);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    };

    const handleClearKey = () => {
        clearApiKey();
        setApiKeyState('');
        setHasKey(false);
    };

    const handleExportAll = async () => {
        try {
            const sessions = await getSessions();
            const csv = exportSessionsToCSV(sessions);
            downloadCSV(csv, `focusarch-full-export-${new Date().toISOString().split('T')[0]}.csv`);
        } catch (err) {
            console.error('Export failed', err);
        }
    };

    const handleExportJSON = async () => {
        try {
            const sessions = await getSessions();
            const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `focusarch-backup-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (err) {
            console.error('Export failed', err);
        }
    };

    return (
        <AppLayout>
            <div className="page-header">
                <h2>Settings</h2>
                <p>Configure your FocusArch experience</p>
            </div>

            {/* Gemini API Key */}
            <div className="settings-section">
                <h3><Icon name="robot" size={18} className="icon-inline" /> Gemini AI Integration</h3>
                <div className="card">
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Enter your Google AI API key to enable AI-powered session summaries and productivity coaching.
                        Get a key at{' '}
                        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                            Google AI Studio
                        </a>.
                    </p>

                    <div className="input-group" style={{ marginBottom: '12px' }}>
                        <label>API Key</label>
                        <div className="flex gap-2">
                            <input
                                className="input"
                                type={showKey ? 'text' : 'password'}
                                placeholder="AIzaSy..."
                                value={apiKey}
                                onChange={(e) => setApiKeyState(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowKey(!showKey)}>
                                {showKey ? <Icon name="eye-off" size={16} /> : <Icon name="eye" size={16} />}
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2 items-center">
                        <button className="btn btn-primary btn-sm" onClick={handleSaveKey}>
                            {saved ? <><Icon name="check-circle" size={14} style={{ color: 'var(--color-success)' }} /> Saved!</> : 'Save Key'}
                        </button>
                        {hasKey && (
                            <button className="btn btn-danger btn-sm" onClick={handleClearKey}>
                                Remove Key
                            </button>
                        )}
                        {hasKey && (
                            <span className="badge badge-active">Connected</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Data Management */}
            <div className="settings-section">
                <h3><Icon name="save" size={18} className="icon-inline" /> Data Management</h3>
                <div className="card">
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Export your session data for backup or analysis.
                    </p>

                    <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary" onClick={handleExportAll}>
                            <Icon name="download" size={14} /> Export CSV
                        </button>
                        <button className="btn btn-secondary" onClick={handleExportJSON}>
                            <Icon name="package" size={14} /> Export JSON Backup
                        </button>
                    </div>
                </div>
            </div>

            {/* About */}
            <div className="settings-section">
                <h3><Icon name="info" size={18} className="icon-inline" /> About</h3>
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>FocusArch</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>v2.0.0 — Productivity Tracker</div>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Built with Next.js + Supabase + Gemini AI
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
