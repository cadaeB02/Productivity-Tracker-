'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { useCompany } from '@/components/CompanyContext';
import { getNotes, addNote, updateNote, deleteNote, toggleNotePin } from '@/lib/store';
import { encryptContent, decryptContent, hasVaultPassword, setVaultPasswordHash, verifyVaultPassword } from '@/lib/vault';

const CATEGORIES = [
    { key: 'inbox', label: 'Inbox', icon: 'inbox' },
    { key: 'todo', label: 'To-Do', icon: 'clipboard' },
    { key: 'ideas', label: 'Ideas', icon: 'zap' },
    { key: 'passwords', label: 'Passwords', icon: 'lock' },
    { key: 'reference', label: 'Reference', icon: 'bookmark' },
];

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotesPage() {
    const { activeCompanyId, activeCompany } = useCompany();
    const [notes, setNotes] = useState([]);
    const [activeTab, setActiveTab] = useState('inbox');
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ title: '', content: '' });

    // Vault state
    const [vaultUnlocked, setVaultUnlocked] = useState(false);
    const [vaultPassword, setVaultPassword] = useState('');
    const [vaultPrompt, setVaultPrompt] = useState('');
    const [vaultError, setVaultError] = useState('');
    const [decryptedNotes, setDecryptedNotes] = useState({});
    const [showingPasswords, setShowingPasswords] = useState({});

    const loadNotes = useCallback(async () => {
        try {
            const filters = {};
            if (activeTab) filters.category = activeTab;
            if (activeCompanyId) filters.companyId = activeCompanyId;
            if (searchQuery.trim()) {
                filters.search = searchQuery.trim();
                delete filters.category; // search across all categories
            }
            const data = await getNotes(filters);
            setNotes(data);
        } catch (err) {
            console.error('Failed to load notes', err);
        }
        setLoading(false);
    }, [activeTab, activeCompanyId, searchQuery]);

    useEffect(() => {
        setLoading(true);
        loadNotes();
    }, [loadNotes]);

    const resetForm = () => {
        setForm({ title: '', content: '' });
        setEditingId(null);
        setShowForm(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.content.trim()) return;

        try {
            let content = form.content;
            let isEncrypted = false;

            // Encrypt if adding to passwords category
            if (activeTab === 'passwords' && vaultUnlocked) {
                content = await encryptContent(form.content, vaultPassword);
                isEncrypted = true;
            }

            if (editingId) {
                await updateNote(editingId, {
                    title: form.title,
                    content,
                    is_encrypted: isEncrypted,
                });
            } else {
                await addNote({
                    category: activeTab,
                    title: form.title,
                    content,
                    company_id: activeCompanyId || null,
                    is_encrypted: isEncrypted,
                });
            }
            resetForm();
            loadNotes();
        } catch (err) {
            console.error('Failed to save note', err);
        }
    };

    const handleEdit = async (note) => {
        let content = note.content;
        if (note.is_encrypted && vaultUnlocked) {
            content = decryptedNotes[note.id] || await decryptContent(note.content, vaultPassword) || '[Decryption failed]';
        }
        setForm({ title: note.title || '', content });
        setEditingId(note.id);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this note?')) return;
        try {
            await deleteNote(id);
            loadNotes();
        } catch (err) {
            console.error('Failed to delete note', err);
        }
    };

    const handlePin = async (note) => {
        try {
            await toggleNotePin(note.id, note.pinned);
            loadNotes();
        } catch (err) {
            console.error('Failed to toggle pin', err);
        }
    };

    // Vault unlock
    const handleVaultUnlock = async (e) => {
        e.preventDefault();
        const isFirstTime = !hasVaultPassword();

        if (isFirstTime) {
            await setVaultPasswordHash(vaultPrompt);
            setVaultPassword(vaultPrompt);
            setVaultUnlocked(true);
            setVaultError('');
        } else {
            const valid = await verifyVaultPassword(vaultPrompt);
            if (valid) {
                setVaultPassword(vaultPrompt);
                setVaultUnlocked(true);
                setVaultError('');
            } else {
                setVaultError('Wrong vault password');
            }
        }
    };

    // Decrypt a single note for viewing
    const handleDecryptNote = async (note) => {
        if (decryptedNotes[note.id]) {
            // Toggle visibility
            setShowingPasswords(prev => ({ ...prev, [note.id]: !prev[note.id] }));
            return;
        }
        const plaintext = await decryptContent(note.content, vaultPassword);
        if (plaintext) {
            setDecryptedNotes(prev => ({ ...prev, [note.id]: plaintext }));
            setShowingPasswords(prev => ({ ...prev, [note.id]: true }));
        }
    };

    // Move note between categories
    const handleMoveNote = async (note, newCategory) => {
        try {
            await updateNote(note.id, { category: newCategory });
            loadNotes();
        } catch (err) {
            console.error('Failed to move note', err);
        }
    };

    const activeCategory = CATEGORIES.find(c => c.key === activeTab);

    if (loading) {
        return (
            <AppLayout>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <div className="loading-spinner" />
                </div>
            </AppLayout>
        );
    }

    // Vault lock screen for passwords tab
    const showVaultLock = activeTab === 'passwords' && !vaultUnlocked;

    return (
        <AppLayout>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {activeCompany && (
                        <span className="color-dot" style={{ backgroundColor: activeCompany.color, width: '12px', height: '12px', borderRadius: '50%' }} />
                    )}
                    <div>
                        <h2>{activeCompany ? `${activeCompany.name} — Notes` : 'Notes'}</h2>
                        <p>Capture, organize, and secure your information</p>
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div style={{ marginBottom: '16px' }}>
                <input
                    className="input"
                    type="text"
                    placeholder="Search all notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ maxWidth: '400px' }}
                />
            </div>

            {/* Tab Bar */}
            <div className="notes-tabs">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat.key}
                        className={`notes-tab ${activeTab === cat.key ? 'active' : ''}`}
                        onClick={() => { setActiveTab(cat.key); setSearchQuery(''); resetForm(); }}
                    >
                        <Icon name={cat.icon} size={14} />
                        <span>{cat.label}</span>
                    </button>
                ))}
            </div>

            {/* Vault Lock Screen */}
            {showVaultLock && (
                <div className="card" style={{ maxWidth: '400px', margin: '40px auto', textAlign: 'center' }}>
                    <Icon name="lock" size={32} style={{ color: 'var(--color-accent)', marginBottom: '12px' }} />
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>
                        {hasVaultPassword() ? 'Vault Locked' : 'Set Vault Password'}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        {hasVaultPassword()
                            ? 'Enter your vault password to decrypt your passwords.'
                            : 'Create a vault password to encrypt your sensitive data. This is stored only on your device.'}
                    </p>
                    <form onSubmit={handleVaultUnlock}>
                        <input
                            className="input"
                            type="password"
                            placeholder={hasVaultPassword() ? 'Vault password...' : 'Create vault password...'}
                            value={vaultPrompt}
                            onChange={(e) => { setVaultPrompt(e.target.value); setVaultError(''); }}
                            autoFocus
                            style={{ marginBottom: '8px' }}
                        />
                        {vaultError && <div style={{ color: 'var(--color-danger)', fontSize: '0.78rem', marginBottom: '8px' }}>{vaultError}</div>}
                        <button className="btn btn-primary" type="submit" style={{ width: '100%' }}>
                            <Icon name="lock" size={14} /> {hasVaultPassword() ? 'Unlock' : 'Create Password'}
                        </button>
                    </form>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '12px' }}>
                        Encrypted with AES-256. Your password never leaves this device.
                    </p>
                </div>
            )}

            {/* Notes Content */}
            {!showVaultLock && (
                <>
                    {/* Add Button */}
                    <div style={{ marginBottom: '16px', marginTop: '16px' }}>
                        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}>
                            <Icon name="plus" size={14} /> {showForm ? 'Cancel' : 'Add Note'}
                        </button>
                    </div>

                    {/* Form */}
                    {showForm && (
                        <div className="card" style={{ marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px' }}>
                                {editingId ? 'Edit Note' : `New ${activeCategory?.label || ''} Note`}
                            </h3>
                            <form onSubmit={handleSubmit}>
                                <div className="input-group" style={{ marginBottom: '10px' }}>
                                    <label>Title (optional)</label>
                                    <input
                                        className="input"
                                        placeholder="Note title..."
                                        value={form.title}
                                        onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                                    />
                                </div>
                                <div className="input-group" style={{ marginBottom: '12px' }}>
                                    <label>Content</label>
                                    <textarea
                                        className="input"
                                        placeholder={activeTab === 'passwords' ? 'username: ...\npassword: ...\nnotes: ...' : 'What do you want to capture?'}
                                        value={form.content}
                                        onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
                                        rows={activeTab === 'passwords' ? 5 : 3}
                                        required
                                        style={{ resize: 'vertical', fontFamily: activeTab === 'passwords' ? 'monospace' : 'inherit' }}
                                    />
                                </div>
                                {activeTab === 'passwords' && (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Icon name="lock" size={10} /> This note will be encrypted before saving
                                    </div>
                                )}
                                <button className="btn btn-primary" type="submit">
                                    <Icon name="save" size={14} /> {editingId ? 'Update' : 'Save'} Note
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Notes List */}
                    {notes.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon"><Icon name={activeCategory?.icon || 'inbox'} size={48} /></div>
                            <h3>No {activeCategory?.label?.toLowerCase() || ''} notes yet</h3>
                            <p>{activeTab === 'inbox'
                                ? 'Captured notes from your phone will appear here.'
                                : 'Add your first note to get started.'}
                            </p>
                        </div>
                    ) : (
                        <div className="notes-list">
                            {notes.map(note => (
                                <div key={note.id} className={`notes-card ${note.pinned ? 'pinned' : ''}`}>
                                    <div className="notes-card-header">
                                        <div className="notes-card-title-row">
                                            {note.pinned && <Icon name="bookmark" size={12} className="notes-pin-icon" />}
                                            <span className="notes-card-title">
                                                {note.title || (note.is_encrypted && !showingPasswords[note.id] ? 'Encrypted Note' : (note.content.split('\n')[0].slice(0, 60) || 'Untitled'))}
                                            </span>
                                        </div>
                                        <span className="notes-card-time">{timeAgo(note.updated_at)}</span>
                                    </div>

                                    <div className="notes-card-body">
                                        {note.is_encrypted ? (
                                            showingPasswords[note.id] ? (
                                                <pre className="notes-encrypted-content">{decryptedNotes[note.id]}</pre>
                                            ) : (
                                                <span className="notes-locked-badge">
                                                    <Icon name="lock" size={12} /> Encrypted
                                                </span>
                                            )
                                        ) : (
                                            <div className="notes-card-preview">{note.content}</div>
                                        )}
                                    </div>

                                    <div className="notes-card-actions">
                                        {note.is_encrypted && vaultUnlocked && (
                                            <button className="btn-icon" onClick={() => handleDecryptNote(note)} title={showingPasswords[note.id] ? 'Hide' : 'Reveal'}>
                                                <Icon name={showingPasswords[note.id] ? 'eye-off' : 'eye'} size={14} />
                                            </button>
                                        )}
                                        <button className="btn-icon" onClick={() => handlePin(note)} title={note.pinned ? 'Unpin' : 'Pin'}>
                                            <Icon name="bookmark" size={14} />
                                        </button>
                                        {activeTab === 'inbox' && (
                                            <select
                                                className="notes-move-select"
                                                value=""
                                                onChange={(e) => { if (e.target.value) handleMoveNote(note, e.target.value); }}
                                            >
                                                <option value="">Move to...</option>
                                                {CATEGORIES.filter(c => c.key !== 'inbox' && c.key !== 'passwords').map(c => (
                                                    <option key={c.key} value={c.key}>{c.label}</option>
                                                ))}
                                            </select>
                                        )}
                                        <button className="btn-icon" onClick={() => handleEdit(note)} title="Edit">
                                            <Icon name="edit" size={14} />
                                        </button>
                                        <button className="btn-icon" onClick={() => handleDelete(note.id)} title="Delete">
                                            <Icon name="trash" size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </AppLayout>
    );
}
