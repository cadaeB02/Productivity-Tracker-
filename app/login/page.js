'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('login'); // 'login' or 'signup'

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

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h1>Parallax</h1>
                <p>{mode === 'login' ? 'Sign in to track your productivity' : 'Create your account'}</p>

                {error && <div className="auth-error">{error}</div>}
                {success && <div className="auth-success">{success}</div>}

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

                <div className="auth-footer">
                    {mode === 'login' ? (
                        <>
                            Don&apos;t have an account?{' '}
                            <button
                                className="auth-toggle"
                                onClick={() => { setMode('signup'); setError(''); setSuccess(''); }}
                            >
                                Sign Up
                            </button>
                        </>
                    ) : (
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
                </div>
            </div>
        </div>
    );
}
