'use client';

import { useState } from 'react';
import { generateSessionSummary } from '@/lib/gemini';
import { updateSessionAISummary } from '@/lib/store';
import { formatDuration } from '@/lib/utils';
import Icon from '@/components/Icon';

export default function PendingSummariesModal({ sessions, onClose, onSaved }) {
    const [summaries, setSummaries] = useState({});
    const [completed, setCompleted] = useState(new Set());
    const [activeCard, setActiveCard] = useState(null);
    const [loading, setLoading] = useState(null);

    const handleWriteSummary = (sessionId) => {
        setActiveCard(activeCard === sessionId ? null : sessionId);
    };

    const handleSubmitSummary = async (session) => {
        const summary = summaries[session.id] || '';
        setLoading(session.id);
        try {
            const { createClient } = await import('@/lib/supabase/client');
            const supabase = createClient();
            await supabase
                .from('sessions')
                .update({ summary })
                .eq('id', session.id);

            // Try AI summary
            try {
                const taskName = session.tasks?.name || session.projects?.name || 'Work Session';
                const ai = await generateSessionSummary(taskName, session.duration || 0, summary);
                await updateSessionAISummary(session.id, ai);
            } catch (err) {
                console.log('AI summary skipped:', err.message);
            }

            setCompleted((prev) => new Set([...prev, session.id]));
            setActiveCard(null);
        } catch (err) {
            console.error('Failed to save summary:', err);
        }
        setLoading(null);
    };

    const handleSkipAll = () => {
        onSaved?.();
        onClose();
    };

    const handleDone = () => {
        onSaved?.();
        onClose();
    };

    const allDone = completed.size === sessions.length;

    return (
        <div className="modal-overlay" onClick={allDone ? handleDone : undefined}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
                <h3><Icon name="clipboard" size={20} className="icon-inline" /> Pending Summaries</h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.9rem' }}>
                    You have {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} to summarize
                </p>

                <div className="pending-summaries-list">
                    {sessions.map((session) => {
                        const taskName = session.tasks?.name || session.projects?.name || 'Task';
                        const companyName = session.companies?.name || '';
                        const companyColor = session.companies?.color || '#6366f1';
                        const isDone = completed.has(session.id);
                        const isActive = activeCard === session.id;
                        const isLoading = loading === session.id;

                        return (
                            <div key={session.id} className={`pending-summary-card ${isDone ? 'done' : ''}`}>
                                <div className="pending-summary-header">
                                    <div className="pending-summary-info">
                                        <span className="color-dot" style={{ backgroundColor: companyColor }} />
                                        <div>
                                            <div className="pending-summary-task">{taskName}</div>
                                            <div className="pending-summary-meta">
                                                {companyName} • {formatDuration(session.duration || session.elapsed || 0)}
                                            </div>
                                        </div>
                                    </div>
                                    {isDone ? (
                                        <span className="pending-summary-check"><Icon name="check-circle" size={20} style={{ color: 'var(--color-success)' }} /></span>
                                    ) : (
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => handleWriteSummary(session.id)}
                                        >
                                            {isActive ? 'Cancel' : 'Write Summary'}
                                        </button>
                                    )}
                                </div>

                                {isActive && !isDone && (
                                    <div className="pending-summary-form">
                                        <textarea
                                            className="input"
                                            placeholder="What did you work on?"
                                            value={summaries[session.id] || ''}
                                            onChange={(e) =>
                                                setSummaries((prev) => ({ ...prev, [session.id]: e.target.value }))
                                            }
                                            rows={2}
                                        />
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => handleSubmitSummary(session)}
                                            disabled={isLoading}
                                            style={{ alignSelf: 'flex-end', marginTop: '8px' }}
                                        >
                                            {isLoading ? 'Saving...' : <><Icon name="sparkle" size={14} /> Save & AI Summary</>}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="modal-actions">
                    <button className="btn btn-ghost" onClick={handleSkipAll}>
                        Skip All
                    </button>
                    <button className="btn btn-primary" onClick={handleDone}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
