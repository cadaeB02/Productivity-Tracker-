'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';
import { updateSession, deleteSession } from '@/lib/store';
import { formatDurationShort, formatDate, formatTime } from '@/lib/utils';

export default function SessionDetailModal({ session, onClose, onSaved }) {
    const [editing, setEditing] = useState(false);
    const [editFields, setEditFields] = useState({});
    const [saving, setSaving] = useState(false);

    if (!session) return null;

    const startEdit = () => {
        setEditing(true);
        setEditFields({
            start_time: session.start_time ? new Date(session.start_time).toISOString().slice(0, 16) : '',
            end_time: session.end_time ? new Date(session.end_time).toISOString().slice(0, 16) : '',
            summary: session.summary || '',
            ai_summary: session.ai_summary || '',
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const updates = {
                summary: editFields.summary,
                ai_summary: editFields.ai_summary,
            };

            // Recalculate duration if times changed
            if (editFields.start_time && editFields.end_time) {
                const start = new Date(editFields.start_time);
                const end = new Date(editFields.end_time);
                updates.start_time = start.toISOString();
                updates.end_time = end.toISOString();
                updates.duration = Math.max(0, Math.floor((end - start) / 1000));
            }

            await updateSession(session.id, updates);
            setEditing(false);
            onSaved?.();
        } catch (err) {
            console.error('Failed to save session', err);
        }
        setSaving(false);
    };

    const handleDelete = async () => {
        if (!confirm('Delete this session permanently?')) return;
        try {
            await deleteSession(session.id);
            onClose();
            onSaved?.();
        } catch (err) {
            console.error('Failed to delete session', err);
        }
    };

    const companyName = session.companies?.name || 'Unknown';
    const taskName = session.tasks?.name || 'Unknown';
    const projectName = session.projects?.name || '';
    const companyColor = session.companies?.color || '#6366f1';

    return (
        <div className="session-detail-modal">
            <div className="modal-backdrop" onClick={onClose}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <div className="modal-header">
                        <h3>
                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: companyColor, marginRight: 8 }} />
                            {taskName}
                        </h3>
                        <div className="flex gap-2">
                            {!editing && (
                                <button className="btn-icon" title="Edit" onClick={startEdit}>
                                    <Icon name="edit" size={16} />
                                </button>
                            )}
                            <button className="btn-icon" title="Close" onClick={onClose}>
                                <Icon name="close" size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Details */}
                    {!editing ? (
                        <>
                            <div className="detail-row">
                                <span className="detail-label">Company</span>
                                <span className="detail-value">{companyName}</span>
                            </div>
                            {projectName && (
                                <div className="detail-row">
                                    <span className="detail-label">Project</span>
                                    <span className="detail-value">{projectName}</span>
                                </div>
                            )}
                            <div className="detail-row">
                                <span className="detail-label">Date</span>
                                <span className="detail-value">{formatDate(session.start_time)}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Time</span>
                                <span className="detail-value">
                                    {formatTime(session.start_time)} — {session.end_time ? formatTime(session.end_time) : 'In Progress'}
                                </span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Duration</span>
                                <span className="detail-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--text-accent)' }}>
                                    {formatDurationShort(session.duration)}
                                </span>
                            </div>

                            {session.summary && (
                                <div className="summary-section">
                                    <h4>Notes</h4>
                                    <p>{session.summary}</p>
                                </div>
                            )}
                            {session.ai_summary && (
                                <div className="summary-section" style={{ marginTop: 12 }}>
                                    <h4><Icon name="sparkle" size={12} style={{ marginRight: 4 }} /> AI Summary</h4>
                                    <p>{session.ai_summary}</p>
                                </div>
                            )}

                            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                                    <Icon name="trash" size={14} /> Delete Session
                                </button>
                            </div>
                        </>
                    ) : (
                        /* Edit Mode */
                        <>
                            <div className="input-group" style={{ marginBottom: 12 }}>
                                <label>Start Time</label>
                                <input
                                    className="input"
                                    type="datetime-local"
                                    value={editFields.start_time}
                                    onChange={(e) => setEditFields(p => ({ ...p, start_time: e.target.value }))}
                                />
                            </div>
                            <div className="input-group" style={{ marginBottom: 12 }}>
                                <label>End Time</label>
                                <input
                                    className="input"
                                    type="datetime-local"
                                    value={editFields.end_time}
                                    onChange={(e) => setEditFields(p => ({ ...p, end_time: e.target.value }))}
                                />
                            </div>

                            {editFields.start_time && editFields.end_time && (
                                <div style={{ marginBottom: 12, fontSize: '0.85rem', color: 'var(--text-accent)', fontFamily: "'JetBrains Mono', monospace" }}>
                                    Duration: {formatDurationShort(Math.max(0, Math.floor((new Date(editFields.end_time) - new Date(editFields.start_time)) / 1000)))}
                                </div>
                            )}

                            <div className="input-group" style={{ marginBottom: 12 }}>
                                <label>Notes</label>
                                <textarea
                                    className="input"
                                    rows={3}
                                    value={editFields.summary}
                                    onChange={(e) => setEditFields(p => ({ ...p, summary: e.target.value }))}
                                    placeholder="Session notes..."
                                />
                            </div>
                            <div className="input-group" style={{ marginBottom: 16 }}>
                                <label>AI Summary</label>
                                <textarea
                                    className="input"
                                    rows={3}
                                    value={editFields.ai_summary}
                                    onChange={(e) => setEditFields(p => ({ ...p, ai_summary: e.target.value }))}
                                    placeholder="AI-generated summary..."
                                />
                            </div>
                            <div className="modal-actions">
                                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
