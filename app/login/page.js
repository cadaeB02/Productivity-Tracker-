'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/Icon';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('login'); // 'login', 'signup', or 'agent'
    const [agentToken, setAgentToken] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const supabase = createClient();
        const { error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (authError) {
            setError(authError.message);
            setLoading(false);
        } else {
            window.location.href = '/';
        }
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            setLoading(false);
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            setLoading(false);
            return;
        }

        const supabase = createClient();
        const { data, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin,
            },
        });

        if (authError) {
            setError(authError.message);
            setLoading(false);
        } else if (data?.user?.identities?.length === 0) {
            setError('An account with this email already exists. Try signing in.');
            setLoading(false);
        } else {
            // If email confirmation is disabled, user is auto-logged-in
            if (data?.session) {
                window.location.href = '/';
            } else {
                setSuccess('Account created! You can now sign in.');
                setMode('login');
                setPassword('');
                setConfirmPassword('');
                setLoading(false);
            }
        }
    };

    const handleAgentLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/agent-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: agentToken.trim() }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Agent authentication failed');
                setLoading(false);
                return;
            }

            // Use the magic link token to verify OTP and establish session
            const supabase = createClient();
            const { error: verifyError } = await supabase.auth.verifyOtp({
                token_hash: data.token_hash,
                type: data.token_type || 'magiclink',
            });

            if (verifyError) {
                setError('Failed to establish session: ' + verifyError.message);
                setLoading(false);
                return;
            }

            // Success — redirect to home
            window.location.href = '/';
        } catch (err) {
            setError('Connection failed: ' + err.message);
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h1>Parallax</h1>
                <p>
                    {mode === 'login' && 'Sign in to track your productivity'}
                    {mode === 'signup' && 'Create your account'}
                    {mode === 'agent' && 'AI Agent Authentication'}
                </p>

                {error && <div className="auth-error">{error}</div>}
                {success && <div className="auth-success">{success}</div>}

                {/* Normal Login / Signup Form */}
                {mode !== 'agent' && (
                    <form className="auth-form" onSubmit={mode === 'login' ? handleLogin : handleSignUp}>
                        <div className="input-group">
                            <label htmlFor="email">Email</label>
                            <input
                                id="email"
                                type="email"
                                className="input"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="input-group">
                            <label htmlFor="password">Password</label>
                            <input
                                id="password"
                                type="password"
                                className="input"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                        </div>

                        {mode === 'signup' && (
                            <div className="input-group">
                                <label htmlFor="confirmPassword">Confirm Password</label>
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    className="input"
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={6}
                                />
                            </div>
                        )}

                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading
                                ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
                                : (mode === 'login' ? 'Sign In' : 'Create Account')
                            }
                        </button>
                    </form>
                )}

                {/* Agent Login Form */}
                {mode === 'agent' && (
                    <form className="auth-form" onSubmit={handleAgentLogin}>
                        <div className="agent-login-badge">
                            <Icon name="robot" size={20} />
                            <span>Agent Mode</span>
                        </div>

                        <div className="input-group">
                            <label htmlFor="agentToken">Agent Access Token</label>
                            <input
                                id="agentToken"
                                type="password"
                                className="input"
                                placeholder="Paste your agent token..."
                                value={agentToken}
                                onChange={(e) => setAgentToken(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>

                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                            Agent tokens are generated in Settings by the account owner.
                            The agent will have full access to the linked account.
                        </p>

                        <button type="submit" className="btn btn-primary" disabled={loading || !agentToken.trim()}>
                            {loading ? 'Authenticating...' : 'Connect Agent'}
                        </button>
                    </form>
                )}

                <div className="auth-footer">
                    {mode === 'login' && (
                        <>
                            Don&apos;t have an account?{' '}
                            <button
                                className="auth-toggle"
                                onClick={() => { setMode('signup'); setError(''); setSuccess(''); }}
                            >
                                Sign Up
                            </button>
                        </>
                    )}
                    {mode === 'signup' && (
                        <>
                            Already have an account?{' '}
                            <button
                                className="auth-toggle"
                                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                            >
                                Sign In
                            </button>
                        </>
                    )}
                    {mode === 'agent' && (
                        <button
                            className="auth-toggle"
                            onClick={() => { setMode('login'); setError(''); setAgentToken(''); }}
                        >
                            Back to Sign In
                        </button>
                    )}
                </div>

                {/* Agent Mode Toggle */}
                {mode !== 'agent' && (
                    <div className="agent-login-divider">
                        <div className="divider-line" />
                        <span>or</span>
                        <div className="divider-line" />
                    </div>
                )}
                {mode !== 'agent' && (
                    <button
                        className="btn btn-agent-login"
                        onClick={() => { setMode('agent'); setError(''); setSuccess(''); }}
                    >
                        <Icon name="robot" size={16} />
                        I am an AI Agent
                    </button>
                )}
            </div>
        </div>
    );
}
