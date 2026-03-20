'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { getUserSettings, saveUserSettings, getSessions, exportSessionsToCSV, downloadCSV } from '@/lib/store';
import { useTheme } from '@/components/ThemeProvider';
import { hasApiKey as hasLocalApiKey, setApiKey as setLocalApiKey, clearApiKey as clearLocalApiKey } from '@/lib/gemini';

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

    // Password
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
    const [passwordStatus, setPasswordStatus] = useState(null); // { type: 'success'|'error', message: '' }
    const [changingPassword, setChangingPassword] = useState(false);

    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const settings = await getUserSettings();
            if (settings) {
                if (settings.gemini_api_key) {
                    setGeminiKey(settings.gemini_api_key);
                    setHasGemini(true);
                    // Also sync to localStorage for the Gemini client
                    setLocalApiKey(settings.gemini_api_key);
                }
                if (settings.wiw_api_key) {
                    setWiwKey(settings.wiw_api_key);
                    setHasWiw(true);
                }
            } else {
                // Migrate from localStorage if exists
                const localKey = typeof window !== 'undefined' ? localStorage.getItem('parallax_gemini_key') || '' : '';
                if (localKey) {
                    setGeminiKey(localKey);
                    setHasGemini(true);
                }
            }
        } catch (err) {
            console.error('Failed to load settings', err);
            // Fallback to localStorage
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
            setLocalApiKey(geminiKey.trim()); // Keep localStorage in sync for the client
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

            {/* About */}
            <div className="settings-section">
                <h3><Icon name="info" size={18} className="icon-inline" /> About</h3>
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Parallax</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>v3.0.0 — Productivity Tracker</div>
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
