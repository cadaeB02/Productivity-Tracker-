'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { getUserSettings, saveUserSettings, getSessions, exportSessionsToCSV, downloadCSV, getCompanies } from '@/lib/store';
import { useTheme } from '@/components/ThemeProvider';
import { hasApiKey as hasLocalApiKey, setApiKey as setLocalApiKey, clearApiKey as clearLocalApiKey } from '@/lib/gemini';

function generateToken(length = 48) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
        .map(b => chars[b % chars.length])
        .join('');
}

export default function SettingsPage() {
    const { theme, setTheme } = useTheme();

    // Gemini
    const [geminiKey, setGeminiKey] = useState('');
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [geminiSaved, setGeminiSaved] = useState(false);
    const [hasGemini, setHasGemini] = useState(false);

    // When I Work
    const [wiwKey, setWiwKey] = useState('');
    const [showWiwKey, setShowWiwKey] = useState(false);
    const [wiwSaved, setWiwSaved] = useState(false);
    const [hasWiw, setHasWiw] = useState(false);
    const [showWiwHelp, setShowWiwHelp] = useState(false);

    // Agent Access
    const [hasAgentToken, setHasAgentToken] = useState(false);
    const [newToken, setNewToken] = useState(''); // shown once after generation
    const [agentName, setAgentName] = useState('');
    const [agentSaved, setAgentSaved] = useState(false);
    const [tokenCopied, setTokenCopied] = useState(false);

    // Password
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
    const [passwordStatus, setPasswordStatus] = useState(null);
    const [changingPassword, setChangingPassword] = useState(false);

    // Merge Companies
    const [mergeCompanies, setMergeCompanies] = useState([]);
    const [mergeParent, setMergeParent] = useState('');
    const [mergeChildren, setMergeChildren] = useState([]);
    const [merging, setMerging] = useState(false);
    const [mergeResult, setMergeResult] = useState(null);

    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
        loadCompaniesForMerge();
    }, []);

    const loadCompaniesForMerge = async () => {
        try {
            const comps = await getCompanies();
            comps.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
            setMergeCompanies(comps);
        } catch (err) {
            console.error('Failed to load companies for merge', err);
        }
    };

    const loadSettings = async () => {
        try {
            const settings = await getUserSettings();
            if (settings) {
                if (settings.gemini_api_key) {
                    setGeminiKey(settings.gemini_api_key);
                    setHasGemini(true);
                    setLocalApiKey(settings.gemini_api_key);
                }
                if (settings.wiw_api_key) {
                    setWiwKey(settings.wiw_api_key);
                    setHasWiw(true);
                }
                if (settings.agent_token) {
                    setHasAgentToken(true);
                }
                if (settings.agent_name) {
                    setAgentName(settings.agent_name);
                }
            } else {
                const localKey = typeof window !== 'undefined' ? localStorage.getItem('parallax_gemini_key') || '' : '';
                if (localKey) {
                    setGeminiKey(localKey);
                    setHasGemini(true);
                }
            }
        } catch (err) {
            console.error('Failed to load settings', err);
            const localKey = typeof window !== 'undefined' ? localStorage.getItem('parallax_gemini_key') || '' : '';
            if (localKey) {
                setGeminiKey(localKey);
                setHasGemini(true);
            }
        }
        setLoading(false);
    };

    const handleSaveGemini = async () => {
        if (!geminiKey.trim()) return;
        try {
            await saveUserSettings({ gemini_api_key: geminiKey.trim() });
            setLocalApiKey(geminiKey.trim());
            setHasGemini(true);
            setGeminiSaved(true);
            setTimeout(() => setGeminiSaved(false), 2000);
        } catch (err) {
            console.error('Failed to save Gemini key', err);
        }
    };

    const handleClearGemini = async () => {
        try {
            await saveUserSettings({ gemini_api_key: '' });
            clearLocalApiKey();
            setGeminiKey('');
            setHasGemini(false);
        } catch (err) {
            console.error('Failed to clear Gemini key', err);
        }
    };

    const handleSaveWiw = async () => {
        if (!wiwKey.trim()) return;
        try {
            await saveUserSettings({ wiw_api_key: wiwKey.trim() });
            setHasWiw(true);
            setWiwSaved(true);
            setTimeout(() => setWiwSaved(false), 2000);
        } catch (err) {
            console.error('Failed to save WIW key', err);
        }
    };

    const handleClearWiw = async () => {
        try {
            await saveUserSettings({ wiw_api_key: '' });
            setWiwKey('');
            setHasWiw(false);
        } catch (err) {
            console.error('Failed to clear WIW key', err);
        }
    };

    const handleGenerateAgentToken = async () => {
        try {
            const token = generateToken();
            await saveUserSettings({ agent_token: token, agent_name: agentName || 'AI Agent' });
            setNewToken(token);
            setHasAgentToken(true);
        } catch (err) {
            console.error('Failed to generate agent token', err);
        }
    };

    const handleRevokeAgentToken = async () => {
        if (!confirm('Revoke this agent token? The agent will no longer be able to log in.')) return;
        try {
            await saveUserSettings({ agent_token: '', agent_name: '' });
            setHasAgentToken(false);
            setNewToken('');
            setAgentName('');
        } catch (err) {
            console.error('Failed to revoke agent token', err);
        }
    };

    const handleCopyToken = () => {
        navigator.clipboard.writeText(newToken);
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 2000);
    };

    const handleSaveAgentName = async () => {
        try {
            await saveUserSettings({ agent_name: agentName });
            setAgentSaved(true);
            setTimeout(() => setAgentSaved(false), 2000);
        } catch (err) {
            console.error('Failed to save agent name', err);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword.length < 6) {
            setPasswordStatus({ type: 'error', message: 'Password must be at least 6 characters.' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordStatus({ type: 'error', message: 'Passwords do not match.' });
            return;
        }

        setChangingPassword(true);
        setPasswordStatus(null);

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;

            setPasswordStatus({ type: 'success', message: 'Password updated successfully!' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            setPasswordStatus({ type: 'error', message: err.message || 'Failed to update password.' });
        }
        setChangingPassword(false);
    };

    const handleExportAll = async () => {
        try {
            const sessions = await getSessions();
            const csv = exportSessionsToCSV(sessions);
            downloadCSV(csv, `parallax-full-export-${new Date().toISOString().split('T')[0]}.csv`);
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
            link.download = `parallax-backup-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (err) {
            console.error('Export failed', err);
        }
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
            <div className="page-header">
                <h2>Settings</h2>
                <p>Configure your Parallax experience</p>
            </div>

            {/* Appearance */}
            <div className="settings-section">
                <h3><Icon name="palette" size={18} className="icon-inline" /> Appearance</h3>
                <div className="card">
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Choose your preferred theme. Your selection is saved automatically.
                    </p>

                    <div className="theme-toggle-group">
                        <button
                            className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                            onClick={() => setTheme('dark')}
                        >
                            <div className="theme-option-icon">
                                <Icon name="moon" size={20} />
                            </div>
                            <span className="theme-option-label">Dark</span>
                        </button>
                        <button
                            className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                            onClick={() => setTheme('light')}
                        >
                            <div className="theme-option-icon">
                                <Icon name="sun" size={20} />
                            </div>
                            <span className="theme-option-label">Light</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Agent Access */}
            <div className="settings-section">
                <h3><Icon name="robot" size={18} className="icon-inline" /> Agent Access</h3>
                <div className="card">
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Generate a token to allow an AI agent (like OpenClaw) to log into your account
                        and manage your timesheets. The agent will have full access to your data.
                    </p>

                    {/* Agent Name */}
                    <div className="input-group" style={{ marginBottom: '12px' }}>
                        <label>Agent Name</label>
                        <div className="flex gap-2">
                            <input
                                className="input"
                                placeholder="e.g. OpenClaw, My AI Assistant..."
                                value={agentName}
                                onChange={(e) => setAgentName(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            {hasAgentToken && (
                                <button className="btn btn-ghost btn-sm" onClick={handleSaveAgentName}>
                                    {agentSaved ? 'Saved!' : 'Update'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Token Display (shown once after generation) */}
                    {newToken && (
                        <div className="agent-token-display">
                            <div className="agent-token-warning">
                                <Icon name="warning" size={14} />
                                <span>Copy this token now! It will not be shown again.</span>
                            </div>
                            <div className="agent-token-value">
                                <code>{newToken}</code>
                                <button className="btn btn-ghost btn-sm" onClick={handleCopyToken}>
                                    {tokenCopied ? <><Icon name="check" size={14} /> Copied!</> : <><Icon name="copy" size={14} /> Copy</>}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2 items-center">
                        {!hasAgentToken ? (
                            <button className="btn btn-primary btn-sm" onClick={handleGenerateAgentToken}>
                                <Icon name="key" size={14} /> Generate Agent Token
                            </button>
                        ) : (
                            <>
                                <span className="badge badge-active">
                                    <Icon name="check" size={12} style={{ marginRight: 4 }} />
                                    Agent Token Active
                                </span>
                                <button className="btn btn-ghost btn-sm" onClick={handleGenerateAgentToken}>
                                    Regenerate
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={handleRevokeAgentToken}>
                                    Revoke Token
                                </button>
                            </>
                        )}
                    </div>

                    {hasAgentToken && (
                        <div style={{ marginTop: '14px', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            <strong>How to use:</strong> On the Parallax login page, click
                            <strong> "I am an AI Agent"</strong> and paste the token. The agent
                            will be signed in with full access to your account.
                        </div>
                    )}
                </div>
            </div>

            {/* Password Change */}
            <div className="settings-section">
                <h3><Icon name="lock" size={18} className="icon-inline" /> Change Password</h3>
                <div className="card">
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Update your account password. You must be logged in to change your password.
                    </p>

                    <div className="input-group" style={{ marginBottom: '12px' }}>
                        <label>New Password</label>
                        <div className="flex gap-2">
                            <input
                                className="input"
                                type={showPasswords ? 'text' : 'password'}
                                placeholder="Enter new password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowPasswords(!showPasswords)}>
                                <Icon name={showPasswords ? 'eye-off' : 'eye'} size={16} />
                            </button>
                        </div>
                        <div className="password-requirements">Minimum 6 characters</div>
                    </div>

                    <div className="input-group" style={{ marginBottom: '16px' }}>
                        <label>Confirm Password</label>
                        <input
                            className="input"
                            type={showPasswords ? 'text' : 'password'}
                            placeholder="Confirm new password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                        {confirmPassword && (
                            <div className={`password-match ${newPassword === confirmPassword ? 'match' : 'no-match'}`}>
                                {newPassword === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 items-center">
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={handleChangePassword}
                            disabled={changingPassword || !newPassword || !confirmPassword}
                        >
                            {changingPassword ? 'Updating...' : 'Update Password'}
                        </button>
                        {passwordStatus && (
                            <span style={{ fontSize: '0.8rem', color: passwordStatus.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                {passwordStatus.message}
                            </span>
                        )}
                    </div>
                </div>
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
                                type={showGeminiKey ? 'text' : 'password'}
                                placeholder="AIzaSy..."
                                value={geminiKey}
                                onChange={(e) => setGeminiKey(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowGeminiKey(!showGeminiKey)}>
                                {showGeminiKey ? <Icon name="eye-off" size={16} /> : <Icon name="eye" size={16} />}
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2 items-center">
                        <button className="btn btn-primary btn-sm" onClick={handleSaveGemini}>
                            {geminiSaved ? <><Icon name="check-circle" size={14} style={{ color: 'var(--color-success)' }} /> Saved!</> : 'Save Key'}
                        </button>
                        {hasGemini && (
                            <button className="btn btn-danger btn-sm" onClick={handleClearGemini}>
                                Remove Key
                            </button>
                        )}
                        {hasGemini && (
                            <span className="badge badge-active">Connected</span>
                        )}
                    </div>
                </div>
            </div>

            {/* When I Work Integration */}
            <div className="settings-section">
                <h3><Icon name="clock" size={18} className="icon-inline" /> When I Work Integration</h3>
                <div className="card">
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Connect your When I Work account to automatically sync your physical job timesheets.
                    </p>

                    <div className="input-group" style={{ marginBottom: '12px' }}>
                        <label>API Key</label>
                        <div className="flex gap-2">
                            <input
                                className="input"
                                type={showWiwKey ? 'text' : 'password'}
                                placeholder="Enter your When I Work API key"
                                value={wiwKey}
                                onChange={(e) => setWiwKey(e.target.value)}
                                style={{ flex: 1 }}
                            />
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowWiwKey(!showWiwKey)}>
                                {showWiwKey ? <Icon name="eye-off" size={16} /> : <Icon name="eye" size={16} />}
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2 items-center" style={{ marginBottom: '4px' }}>
                        <button className="btn btn-primary btn-sm" onClick={handleSaveWiw}>
                            {wiwSaved ? <><Icon name="check-circle" size={14} style={{ color: 'var(--color-success)' }} /> Saved!</> : 'Save Key'}
                        </button>
                        {hasWiw && (
                            <button className="btn btn-danger btn-sm" onClick={handleClearWiw}>
                                Remove Key
                            </button>
                        )}
                        {hasWiw && (
                            <span className="badge badge-active">Connected</span>
                        )}
                    </div>

                    {/* Help Section */}
                    <div className="help-section">
                        <div
                            className="help-section-header"
                            onClick={() => setShowWiwHelp(!showWiwHelp)}
                        >
                            <Icon name="info" size={14} />
                            Where do I find my API key?
                            <Icon name={showWiwHelp ? 'chevron-up' : 'chevron-down'} size={14} style={{ marginLeft: 'auto' }} />
                        </div>
                        {showWiwHelp && (
                            <div className="help-section-body">
                                <p style={{ marginBottom: 10 }}>You&apos;ll need your manager or account admin to generate an API key for you:</p>
                                <ol>
                                    <li>Your admin logs into <strong>When I Work</strong> on a desktop browser</li>
                                    <li>Navigate to <strong>Settings → Developer</strong> (or <strong>Account → API</strong>)</li>
                                    <li>Click <strong>&quot;Create New Key&quot;</strong> or <strong>&quot;Generate API Key&quot;</strong></li>
                                    <li>Give the key a name like &quot;Parallax Tracker&quot;</li>
                                    <li>Copy the generated key and paste it above</li>
                                </ol>
                                <p style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    <strong>Note:</strong> Only account admins can create API keys. Ask your manager at Golden Bike Shop or Bentgate to help.
                                    The key is stored securely in your database, not in your browser.
                                </p>
                            </div>
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

            {/* Merge Companies */}
            <div className="settings-section">
                <h3><Icon name="folder" size={18} className="icon-inline" /> Merge Companies</h3>
                <div className="card">
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        Consolidate multiple companies into one. All projects, tasks, sessions, transactions, and notes will be moved to the parent company.
                    </p>

                    <div className="input-group" style={{ marginBottom: '12px' }}>
                        <label>Parent Company (keep this one)</label>
                        <select
                            className="input"
                            value={mergeParent}
                            onChange={(e) => {
                                setMergeParent(e.target.value);
                                setMergeChildren([]);
                                setMergeResult(null);
                            }}
                        >
                            <option value="">Select parent company...</option>
                            {mergeCompanies.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {mergeParent && (
                        <div className="input-group" style={{ marginBottom: '16px' }}>
                            <label>Companies to merge into parent (will be deleted after merge)</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                                {mergeCompanies.filter(c => c.id !== mergeParent).map(c => (
                                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={mergeChildren.includes(c.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setMergeChildren(prev => [...prev, c.id]);
                                                } else {
                                                    setMergeChildren(prev => prev.filter(id => id !== c.id));
                                                }
                                                setMergeResult(null);
                                            }}
                                        />
                                        <span className="color-dot" style={{ backgroundColor: c.color, width: '8px', height: '8px', borderRadius: '50%' }} />
                                        {c.name}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {mergeParent && mergeChildren.length > 0 && (
                        <div style={{ marginBottom: '12px', padding: '10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem' }}>
                            <strong>Preview:</strong> {mergeChildren.length} compan{mergeChildren.length === 1 ? 'y' : 'ies'} will be merged into <strong>{mergeCompanies.find(c => c.id === mergeParent)?.name}</strong>. Their projects, tasks, sessions, transactions, and notes will be moved. The merged companies will be deleted.
                        </div>
                    )}

                    {mergeResult && (
                        <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--color-success)' }}>
                            Merged {mergeResult.merged} companies. Moved: {mergeResult.moved.projects} projects, {mergeResult.moved.tasks} tasks, {mergeResult.moved.sessions} sessions, {mergeResult.moved.transactions} transactions, {mergeResult.moved.notes} notes.
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        disabled={!mergeParent || mergeChildren.length === 0 || merging}
                        onClick={async () => {
                            if (!confirm(`Merge ${mergeChildren.length} companies into ${mergeCompanies.find(c => c.id === mergeParent)?.name}? This cannot be undone.`)) return;
                            setMerging(true);
                            try {
                                const res = await fetch('/api/merge-companies', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ parentId: mergeParent, childIds: mergeChildren }),
                                });
                                const data = await res.json();
                                if (data.success) {
                                    setMergeResult(data);
                                    setMergeChildren([]);
                                    loadCompaniesForMerge();
                                } else {
                                    alert('Merge failed: ' + (data.error || 'Unknown error'));
                                }
                            } catch (err) {
                                alert('Merge failed: ' + err.message);
                            }
                            setMerging(false);
                        }}
                    >
                        <Icon name="folder" size={14} /> {merging ? 'Merging...' : 'Merge Companies'}
                    </button>
                </div>
            </div>

            {/* About */}
            <div className="settings-section">
                <h3><Icon name="info" size={18} className="icon-inline" /> About</h3>
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Parallax</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>v7.2.0 — Productivity Tracker</div>
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
