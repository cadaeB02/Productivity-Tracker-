'use client';

import { useState, useEffect } from 'react';
import { generateSessionSummary } from '@/lib/gemini';
import { updateSessionAISummary, endSession } from '@/lib/store';
import { formatDuration } from '@/lib/utils';
import Icon from '@/components/Icon';

export default function ClockOutModal({ session, onClose, onSaved, hasMoreSessions = false }) {
    const [summary, setSummary] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);

    // Time editing state
    const originalDuration = session?.duration || session?.elapsed || 0;
    const [editHours, setEditHours] = useState(Math.floor(originalDuration / 3600));
    const [editMinutes, setEditMinutes] = useState(Math.floor((originalDuration % 3600) / 60));
    const [editSeconds, setEditSeconds] = useState(Math.floor(originalDuration % 60));

    const taskName = session?.tasks?.name || session?.projects?.name || 'Work Session';
    const editedDuration = (editHours * 3600) + (editMinutes * 60) + editSeconds;
    const durationChanged = editedDuration !== originalDuration;

    const handleResetTime = () => {
        setEditHours(Math.floor(originalDuration / 3600));
        setEditMinutes(Math.floor((originalDuration % 3600) / 60));
        setEditSeconds(Math.floor(originalDuration % 60));
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            // If duration was changed, update the session with custom duration
            if (durationChanged) {
                await endSession(session.id, summary, editedDuration);
            } else {
                // Just update the summary on the already-ended session
                const { createClient } = await import('@/lib/supabase/client');
                const supabase = createClient();
                await supabase
                    .from('sessions')
                    .update({ summary })
                    .eq('id', session.id);
            }

            // Try generating AI summary
            try {
                const ai = await generateSessionSummary(taskName, editedDuration, summary);
                setAiResponse(ai);
                await updateSessionAISummary(session.id, ai);
            } catch (err) {
                console.log('AI summary skipped:', err.message);
            }
        } catch (err) {
            console.error('Failed to save session:', err);
        }
        setSaved(true);
        setLoading(false);
    };

    const handleSkip = () => {
        onSaved?.();
        onClose(true); // true = skipped
    };

    const handleDone = () => {
        onSaved?.();
        onClose(false);
    };

    return (
        <div className="modal-overlay" onClick={saved ? handleDone : undefined}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                {!saved ? (
                    <>
                        <h3><Icon name="stop" size={20} className="icon-inline" /> Session Complete</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.9rem' }}>
                            {taskName} • {formatDuration(originalDuration)}
                        </p>

                        {/* Time Editing */}
                        <div className="time-edit-section">
                            <label className="time-edit-label">Adjust Time</label>
                            <div className="time-edit-group">
                                <div className="time-edit-field">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        className="input time-edit-input"
                                        value={String(editHours)}
                                        onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setEditHours(v === '' ? 0 : parseInt(v)); }}
                                        onFocus={(e) => e.target.select()}
                                    />
                                    <span className="time-edit-unit">hrs</span>
                                </div>
                                <span className="time-edit-sep">:</span>
                                <div className="time-edit-field">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        className="input time-edit-input"
                                        value={String(editMinutes)}
                                        onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setEditMinutes(v === '' ? 0 : Math.min(59, parseInt(v))); }}
                                        onFocus={(e) => e.target.select()}
                                    />
                                    <span className="time-edit-unit">min</span>
                                </div>
                                <span className="time-edit-sep">:</span>
                                <div className="time-edit-field">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        className="input time-edit-input"
                                        value={String(editSeconds)}
                                        onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setEditSeconds(v === '' ? 0 : Math.min(59, parseInt(v))); }}
                                        onFocus={(e) => e.target.select()}
                                    />
                                    <span className="time-edit-unit">sec</span>
                                </div>
                            </div>
                            <div className="time-edit-meta">
                                <span>Original: {formatDuration(originalDuration)}</span>
                                {durationChanged && (
                                    <button className="time-edit-reset" onClick={handleResetTime}>
                                        reset
                                    </button>
                                )}
                            </div>
                            <p className="time-edit-hint">
                                Adjust the actual time you worked (e.g., subtract breaks)
                            </p>
                        </div>

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
                                {hasMoreSessions ? 'Skip for now' : 'Skip'}
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
                                    <><Icon name="sparkle" size={14} /> Save & Get AI Summary</>
                                )}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h3><Icon name="check-circle" size={20} className="icon-inline" style={{ color: 'var(--color-success)' }} /> Session Saved</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
                            {taskName} • {formatDuration(editedDuration)}
                            {durationChanged && (
                                <span style={{ color: 'var(--color-warning)', fontSize: '0.8rem', marginLeft: '8px' }}>
                                    (adjusted)
                                </span>
                            )}
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
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Icon name="robot" size={14} /> AI Summary
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
