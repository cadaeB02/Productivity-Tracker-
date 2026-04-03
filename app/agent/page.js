'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import {
    getSessions,
    getCompanies,
    getAllProjects,
    getAllTasks,
    updateSession,
    deleteSession,
    addManualSession,
    getActiveSessions,
} from '@/lib/store';
import {
    chatWithAgentActions,
    generatePrioritySuggestions,
    generateProactiveSuggestion,
    getDismissedSuggestions,
    dismissSuggestion,
    hasApiKey,
} from '@/lib/gemini';
import { formatDurationShort, toLocalISOString } from '@/lib/utils';

export default function PersonalAgentPage() {
    const [companies, setCompanies] = useState([]);
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [activeSessions, setActiveSessions] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState('');
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasKey, setHasKey] = useState(false);
    const [pendingActions, setPendingActions] = useState(null);
    const [applyingActions, setApplyingActions] = useState(false);
    const chatEndRef = useRef(null);

    // Image upload state
    const [attachedImages, setAttachedImages] = useState([]); // base64 data URLs
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    // Proactive suggestion
    const [suggestion, setSuggestion] = useState(null);
    const [suggestionLoading, setSuggestionLoading] = useState(false);

    useEffect(() => {
        setHasKey(hasApiKey());
        loadData();
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadData = async () => {
        try {
            const [c, p, t, s, active] = await Promise.all([
                getCompanies(),
                getAllProjects(),
                getAllTasks(),
                getSessions(),
                getActiveSessions(),
            ]);
            setCompanies(c);
            setProjects(p);
            setTasks(t);
            setSessions(s);
            setActiveSessions(active);
        } catch (err) {
            console.error(err);
        }
    };

    // Load proactive suggestion on first load
    const loadSuggestion = useCallback(async () => {
        if (!hasApiKey() || suggestionLoading) return;
        setSuggestionLoading(true);
        try {
            const sessionCtx = buildSessionContext();
            const compCtx = buildCompaniesContext();
            const dismissed = getDismissedSuggestions();
            const text = await generateProactiveSuggestion(sessionCtx, compCtx, activeSessions, dismissed);
            if (text) setSuggestion(text);
        } catch (err) {
            console.warn('Suggestion load failed:', err);
        }
        setSuggestionLoading(false);
    }, [activeSessions]);

    useEffect(() => {
        if (companies.length > 0 && sessions.length > 0) {
            loadSuggestion();
        }
    }, [companies.length, sessions.length]);

    const handleDismissSuggestion = () => {
        if (suggestion) {
            dismissSuggestion(suggestion);
            setSuggestion(null);
        }
    };

    const buildSessionContext = () => {
        const filtered = selectedCompany
            ? sessions.filter(s => s.company_id === selectedCompany)
            : sessions;

        return filtered.slice(0, 30).map(s => {
            const start = new Date(s.start_time);
            const end = s.end_time ? new Date(s.end_time) : null;
            const hours = s.duration ? (s.duration / 3600).toFixed(1) : '?';
            const task = s.tasks?.name || 'Unknown';
            const company = s.companies?.name || 'Unknown';
            const project = s.projects?.name || '';
            const summary = s.summary || s.ai_summary || '';
            const status = s.end_time ? 'completed' : 'ACTIVE (running now)';

            return `ID: ${s.id} | ${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end ? end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'NOW'} | ${company} > ${project ? project + ' > ' : ''}${task} | ${hours}h | ${status}${summary ? ' | ' + summary : ''}`;
        }).join('\n') || 'No sessions found.';
    };

    const buildCompaniesContext = () => {
        return companies.map(c => {
            const compProjects = projects.filter(p => p.company_id === c.id);
            const projectLines = compProjects.map(p => {
                const projTasks = tasks.filter(t => t.project_id === p.id);
                const taskList = projTasks.map(t => `    - Task: "${t.name}" (task_id: ${t.id})`).join('\n');
                return `  - Project: "${p.name}" (project_id: ${p.id})\n${taskList}`;
            }).join('\n');
            const typeInfo = c.company_type ? ` [${c.company_type}]` : '';
            const payInfo = c.pay_rate ? ` | $${c.pay_rate}/${c.pay_type || 'hr'}` : '';
            return `Company: "${c.name}" (company_id: ${c.id})${typeInfo}${payInfo}\n${projectLines}`;
        }).join('\n\n') || 'No companies set up.';
    };

    // ── Image handling ──

    const processFiles = async (files) => {
        const maxImages = 5;
        const remaining = maxImages - attachedImages.length;
        const toProcess = Array.from(files).slice(0, remaining);

        for (const file of toProcess) {
            if (!file.type.startsWith('image/')) continue;

            // Handle HEIC conversion (iPhone photos)
            let processedFile = file;
            if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
                try {
                    const heic2any = (await import('heic2any')).default;
                    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
                    processedFile = new File([blob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
                } catch (err) {
                    console.warn('HEIC conversion failed, using original:', err);
                }
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                setAttachedImages(prev => [...prev, e.target.result]);
            };
            reader.readAsDataURL(processedFile);
        }
    };

    const handleFileSelect = (e) => {
        processFiles(e.target.files);
        e.target.value = ''; // Reset so same file can be selected again
    };

    const removeImage = (index) => {
        setAttachedImages(prev => prev.filter((_, i) => i !== index));
    };

    // Drag and drop
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files?.length > 0) {
            processFiles(e.dataTransfer.files);
        }
    };

    // ── Quick actions ──

    const handlePlanSession = async () => {
        if (!hasKey) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'No Gemini API key found. Please add one in **Settings** first.',
            }]);
            return;
        }

        setLoading(true);
        const companyName = selectedCompany
            ? companies.find(c => c.id === selectedCompany)?.name
            : null;

        setMessages(prev => [...prev, {
            role: 'user',
            content: `Plan my next session${companyName ? ` for ${companyName}` : ''}`,
        }]);

        try {
            const filters = {};
            if (selectedCompany) filters.companyId = selectedCompany;
            const recentSessions = await getSessions(filters);
            const response = await generatePrioritySuggestions(recentSessions, companyName);
            setMessages(prev => [...prev, { role: 'assistant', content: response }]);
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Error: ${err.message}`,
            }]);
        }
        setLoading(false);
    };

    const handleQuickAction = (prompt) => {
        setInput(prompt);
    };

    // ── Chat ──

    const handleChat = async () => {
        if ((!input.trim() && attachedImages.length === 0) || loading) return;
        if (!hasKey) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'No Gemini API key found. Please add one in **Settings** first.',
            }]);
            return;
        }

        const userMessage = input.trim();
        const userImages = [...attachedImages];
        setInput('');
        setAttachedImages([]);
        setMessages(prev => [...prev, { role: 'user', content: userMessage, images: userImages }]);
        setLoading(true);

        try {
            const sessionContext = buildSessionContext();
            const companiesContext = buildCompaniesContext();
            const { text, actions } = await chatWithAgentActions(
                userMessage,
                sessionContext,
                companiesContext,
                userImages
            );

            const msgIndex = messages.length + 1;
            setMessages(prev => [...prev, { role: 'assistant', content: text, actions }]);

            if (actions && actions.length > 0) {
                setPendingActions({ messageIndex: msgIndex, actions });
            }
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Error: ${err.message}`,
            }]);
        }
        setLoading(false);
    };

    const handleApplyActions = async () => {
        if (!pendingActions) return;
        setApplyingActions(true);

        const results = [];
        for (const action of pendingActions.actions) {
            try {
                switch (action.type) {
                    case 'update_session': {
                        const updates = {};
                        if (action.updates?.start_time) {
                            const start = new Date(action.updates.start_time);
                            updates.start_time = start.toISOString();
                        }
                        if (action.updates?.end_time) {
                            const end = new Date(action.updates.end_time);
                            updates.end_time = end.toISOString();
                        }
                        if (updates.start_time && updates.end_time) {
                            updates.duration = Math.max(0, Math.floor((new Date(updates.end_time) - new Date(updates.start_time)) / 1000));
                        }
                        await updateSession(action.session_id, updates);
                        results.push(`✅ ${action.description}`);
                        break;
                    }
                    case 'create_session': {
                        const startTime = new Date(action.start_time);
                        const endTime = new Date(action.end_time);
                        const duration = Math.max(0, Math.floor((endTime - startTime) / 1000));
                        await addManualSession(
                            action.task_id,
                            action.project_id,
                            action.company_id,
                            action.start_time,
                            duration,
                            action.summary || ''
                        );
                        results.push(`[done] ${action.description}`);
                        break;
                    }
                    case 'delete_session': {
                        await deleteSession(action.session_id);
                        results.push(`✅ ${action.description}`);
                        break;
                    }
                    default:
                        results.push(`[warning] Unknown action type: ${action.type}`);
                }
            } catch (err) {
                results.push(`[error] Failed: ${action.description} - ${err.message}`);
            }
        }

        setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Changes applied!**\n\n${results.join('\n')}`,
        }]);

        setPendingActions(null);
        setApplyingActions(false);
        await loadData();
    };

    const handleRejectActions = () => {
        setPendingActions(null);
        setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'No changes were made. Let me know if you need anything else!',
        }]);
    };

    // Active sessions summary for header
    const activeCount = activeSessions.length;

    return (
        <AppLayout>
            <div className="pa-container"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Header */}
                <div className="pa-header">
                    <div className="pa-header-left">
                        <h2 className="pa-title">
                            <Icon name="robot" size={24} className="icon-inline" />
                            Personal Agent
                        </h2>
                        <p className="pa-subtitle">Your AI-powered productivity assistant - chat, upload images, manage timesheets</p>
                    </div>
                    <div className="pa-header-right">
                        {activeCount > 0 && (
                            <div className="pa-active-badge">
                                <span className="pa-active-dot" />
                                {activeCount} active {activeCount === 1 ? 'session' : 'sessions'}
                            </div>
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className="pa-toolbar">
                    <select
                        className="input pa-company-select"
                        value={selectedCompany}
                        onChange={(e) => setSelectedCompany(e.target.value)}
                    >
                        <option value="">All Companies</option>
                        {companies.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>

                    <div className="pa-quick-actions">
                        <button className="pa-quick-btn" onClick={handlePlanSession} disabled={loading}>
                            <Icon name="target" size={14} /> Plan My Day
                        </button>
                        <button className="pa-quick-btn" onClick={() => handleQuickAction('Here\'s a screenshot of my timesheet. Please parse the times and add the sessions.')} disabled={loading}>
                            <Icon name="clipboard" size={14} /> Scan Timesheet
                        </button>
                        <button className="pa-quick-btn" onClick={() => handleQuickAction('Give me a weekly summary of my work hours across all companies.')} disabled={loading}>
                            <Icon name="chart" size={14} /> Weekly Summary
                        </button>
                    </div>

                    <button
                        className="btn btn-ghost pa-clear-btn"
                        onClick={() => { setMessages([]); setPendingActions(null); }}
                        disabled={messages.length === 0}
                    >
                        Clear Chat
                    </button>
                </div>

                {/* Proactive Suggestion Banner */}
                {suggestion && (
                    <div className="pa-suggestion-banner">
                        <div className="pa-suggestion-text">{suggestion}</div>
                        <div className="pa-suggestion-actions">
                            <button className="pa-suggestion-action" onClick={() => {
                                setInput(suggestion.replace(/^[^\s]+\s/, '')); // Strip leading emoji
                                handleDismissSuggestion();
                            }}>
                                <Icon name="chat" size={12} /> Reply
                            </button>
                            <button className="pa-suggestion-dismiss" onClick={handleDismissSuggestion}>
                                <Icon name="close" size={12} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Drag overlay */}
                {isDragging && (
                    <div className="pa-drop-overlay">
                        <div className="pa-drop-content">
                            <Icon name="upload" size={48} />
                            <p>Drop images here</p>
                        </div>
                    </div>
                )}

                {/* Chat Area */}
                <div className="pa-chat-area">
                    {messages.length === 0 ? (
                        <div className="pa-empty-state">
                            <div className="pa-empty-icon">
                                <Icon name="robot" size={56} />
                            </div>
                            <h3>Your Personal Agent</h3>
                            <p>Upload images, ask questions, manage timesheets. I'm here to help.</p>

                            <div className="pa-category-grid">
                                <button className="pa-category-card" onClick={() => {
                                    handleQuickAction('Here\'s a screenshot of my timesheet. Please parse the punch times and add sessions.');
                                    fileInputRef.current?.click();
                                }}>
                                    <span className="pa-category-emoji"><Icon name="eye" size={22} /></span>
                                    <span className="pa-category-label">Scan a Timesheet</span>
                                    <span className="pa-category-desc">Upload a photo and I'll extract the times</span>
                                </button>
                                <button className="pa-category-card" onClick={() => handleQuickAction('I forgot to clock out of my shift. I actually stopped at 5pm')}>
                                    <span className="pa-category-emoji"><Icon name="clock" size={22} /></span>
                                    <span className="pa-category-label">Fix Clock Times</span>
                                    <span className="pa-category-desc">Adjust start/end times on sessions</span>
                                </button>
                                <button className="pa-category-card" onClick={() => handleQuickAction('Give me a summary of my work patterns this week across all companies')}>
                                    <span className="pa-category-emoji"><Icon name="chart" size={22} /></span>
                                    <span className="pa-category-label">Get Insights</span>
                                    <span className="pa-category-desc">Analyze your productivity patterns</span>
                                </button>
                                <button className="pa-category-card" onClick={() => handleQuickAction('What should I work on next? Help me plan my day.')}>
                                    <span className="pa-category-emoji"><Icon name="note" size={22} /></span>
                                    <span className="pa-category-label">Plan My Day</span>
                                    <span className="pa-category-desc">Get prioritized task suggestions</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="pa-messages">
                            {messages.map((msg, i) => (
                                <div key={i} className={`pa-message ${msg.role}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="pa-message-avatar">
                                            <Icon name="robot" size={16} />
                                        </div>
                                    )}
                                    <div className="pa-message-content">
                                        {/* Show attached images in user messages */}
                                        {msg.images && msg.images.length > 0 && (
                                            <div className="pa-message-images">
                                                {msg.images.map((img, ii) => (
                                                    <img key={ii} src={img} alt={`Attached ${ii + 1}`} className="pa-message-image" />
                                                ))}
                                            </div>
                                        )}
                                        <div className="pa-message-text">{msg.content}</div>

                                        {/* Action cards */}
                                        {msg.actions && msg.actions.length > 0 && (
                                            <div className="pa-actions-card">
                                                <div className="pa-actions-header">
                                                    <Icon name="edit" size={14} />
                                                    <span>Proposed Changes ({msg.actions.length})</span>
                                                </div>
                                                <div className="pa-actions-list">
                                                    {msg.actions.map((action, ai) => (
                                                        <div key={ai} className="pa-action-item">
                                                            <span className={`pa-action-badge ${action.type}`}>
                                                                {action.type === 'update_session' ? 'Edit' : action.type === 'create_session' ? 'Create' : 'Delete'}
                                                            </span>
                                                            <span>{action.description}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                {pendingActions && pendingActions.messageIndex === i && (
                                                    <div className="pa-actions-buttons">
                                                        <button
                                                            className="btn btn-primary btn-sm"
                                                            onClick={handleApplyActions}
                                                            disabled={applyingActions}
                                                        >
                                                            {applyingActions ? (
                                                                <><Icon name="hourglass" size={14} /> Applying...</>
                                                            ) : (
                                                                <><Icon name="check" size={14} /> Apply Changes</>
                                                            )}
                                                        </button>
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={handleRejectActions}
                                                            disabled={applyingActions}
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {loading && (
                                <div className="pa-message assistant">
                                    <div className="pa-message-avatar">
                                        <Icon name="robot" size={16} />
                                    </div>
                                    <div className="pa-message-content">
                                        <div className="pa-typing">
                                            <span /><span /><span />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={chatEndRef} />
                        </div>
                    )}
                </div>

                {/* Image Previews */}
                {attachedImages.length > 0 && (
                    <div className="pa-image-previews">
                        {attachedImages.map((img, i) => (
                            <div key={i} className="pa-image-preview">
                                <img src={img} alt={`Preview ${i + 1}`} />
                                <button className="pa-image-remove" onClick={() => removeImage(i)}>
                                    <Icon name="close" size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Input Area */}
                <div className="pa-input-area">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        multiple
                        style={{ display: 'none' }}
                        capture="environment"
                    />
                    <button
                        className="pa-attach-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                        title="Attach image"
                    >
                        <Icon name="upload" size={18} />
                    </button>
                    <input
                        className="pa-text-input"
                        placeholder="Describe what you need..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChat()}
                        disabled={loading}
                    />
                    <button
                        className="pa-send-btn"
                        onClick={handleChat}
                        disabled={loading || (!input.trim() && attachedImages.length === 0)}
                    >
                        <Icon name="send" size={18} />
                    </button>
                </div>
            </div>
        </AppLayout>
    );
}
