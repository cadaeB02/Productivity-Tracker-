'use client';

import { useState } from 'react';
import { generateSessionSummary } from '@/lib/gemini';
import { updateSessionAISummary } from '@/lib/store';
import { formatDuration } from '@/lib/utils';

export default function ClockOutModal({ session, onClose, onSaved }) {
    const [summary, setSummary] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);

    const taskName = session?.tasks?.name || session?.projects?.name || 'Work Session';
    const duration = session?.duration || 0;

    const handleSubmit = async () => {
        setLoading(true);
        try {
            // Try generating AI summary
            const ai = await generateSessionSummary(taskName, duration, summary);
            setAiResponse(ai);
            await updateSessionAISummary(session.id, ai);
        } catch (err) {
            console.log('AI summary skipped:', err.message);
        }
        setSaved(true);
        setLoading(false);
    };

    const handleSkip = () => {
        onSaved?.();
        onClose();
    };

    const handleDone = () => {
        onSaved?.();
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={saved ? handleDone : undefined}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                {!saved ? (
                    <>
                        <h3>⏹️ Session Complete</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.9rem' }}>
                            {taskName} • {formatDuration(duration)}
                        </p>

                        <div className="input-group" style={{ marginBottom: '20px' }}>
                            <label htmlFor="session-summary">What did you work on?</label>
                            <textarea
                                id="session-summary"
                                className="input"
                                placeholder="Describe what you accomplished this session..."
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                                rows={3}
                            />
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={handleSkip}>
                                Skip
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSubmit}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <div className="loading-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                                        AI Processing...
                                    </>
                                ) : (
                                    '✨ Save & Get AI Summary'
                                )}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h3>✅ Session Saved</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
                            {taskName} • {formatDuration(duration)}
                        </p>

                        {summary && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                    Your Notes
                                </div>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{summary}</p>
                            </div>
                        )}

                        {aiResponse && (
                            <div style={{
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-md)',
                                padding: '16px',
                                marginBottom: '16px',
                            }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                                    🤖 AI Summary
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                                    {aiResponse}
                                </div>
                            </div>
                        )}

                        <div className="modal-actions">
                            <button className="btn btn-primary" onClick={handleDone}>
                                Done
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
