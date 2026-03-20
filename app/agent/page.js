'use client';

import { useState, useEffect, useRef } from 'react';
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
} from '@/lib/store';
import { chatWithAgentActions, generatePrioritySuggestions, hasApiKey } from '@/lib/gemini';
import { formatDurationShort, toLocalISOString } from '@/lib/utils';

export default function AgentPage() {
    const [companies, setCompanies] = useState([]);
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState('');
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasKey, setHasKey] = useState(false);
    const [pendingActions, setPendingActions] = useState(null); // { messageIndex, actions }
    const [applyingActions, setApplyingActions] = useState(false);
    const chatEndRef = useRef(null);

    useEffect(() => {
        setHasKey(hasApiKey());
        loadData();
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadData = async () => {
        try {
            const [c, p, t, s] = await Promise.all([
                getCompanies(),
                getAllProjects(),
                getAllTasks(),
                getSessions(),
            ]);
            setCompanies(c);
            setProjects(p);
            setTasks(t);
            setSessions(s);
        } catch (err) {
            console.error(err);
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
            return `Company: "${c.name}" (company_id: ${c.id})\n${projectLines}`;
        }).join('\n\n') || 'No companies set up.';
    };

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

    const handleChat = async () => {
        if (!input.trim() || loading) return;
        if (!hasKey) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'No Gemini API key found. Please add one in **Settings** first.',
            }]);
            return;
        }

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            const sessionContext = buildSessionContext();
            const companiesContext = buildCompaniesContext();
            const { text, actions } = await chatWithAgentActions(userMessage, sessionContext, companiesContext);

            const msgIndex = messages.length + 1; // +1 because we just added user msg
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
                        results.push(`Updated session: ${action.description}`);
                        break;
                    }
                    case 'create_session': {
                        const startTime = new Date(action.start_time);
                        const endTime = new Date(action.end_time);
                        const duration = Math.max(0, Math.floor((endTime - startTime) / 1000));
                        // Use the raw session insert via addManualSession
                        await addManualSession(
                            action.task_id,
                            action.project_id,
                            action.company_id,
                            action.start_time,
                            duration,
                            action.summary || ''
                        );
                        results.push(`Created session: ${action.description}`);
                        break;
                    }
                    case 'delete_session': {
                        await deleteSession(action.session_id);
                        results.push(`Deleted session: ${action.description}`);
                        break;
                    }
                    default:
                        results.push(`Unknown action type: ${action.type}`);
                }
            } catch (err) {
                results.push(`Failed: ${action.description} — ${err.message}`);
            }
        }

        setMessages(prev => [...prev, {
            role: 'assistant',
            content: `**Changes applied successfully!**\n\n${results.map(r => `- ${r}`).join('\n')}`,
        }]);

        setPendingActions(null);
        setApplyingActions(false);
        // Refresh session data
        await loadData();
    };

    const handleRejectActions = () => {
        setPendingActions(null);
        setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'No changes were made. Let me know if you need anything else!',
        }]);
    };

    return (
        <AppLayout>
            <div className="page-header">
                <h2><Icon name="robot" size={24} className="icon-inline" /> AI Agent</h2>
                <p>Get AI-powered productivity insights — or ask me to edit your timesheets</p>
            </div>

            {/* Controls */}
            <div className="card" style={{ marginBottom: '20px' }}>
                <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
                    <select
                        className="input"
                        value={selectedCompany}
                        onChange={(e) => setSelectedCompany(e.target.value)}
                        style={{ minWidth: '180px' }}
                    >
                        <option value="">All Companies</option>
                        {companies.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>

                    <button
                        className="btn btn-primary"
                        onClick={handlePlanSession}
                        disabled={loading}
                    >
                        {loading ? <><Icon name="hourglass" size={14} /> Thinking...</> : <><Icon name="target" size={14} /> Plan My Next Session</>}
                    </button>

                    <button
                        className="btn btn-ghost"
                        onClick={() => { setMessages([]); setPendingActions(null); }}
                        disabled={messages.length === 0}
                    >
                        Clear Chat
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <div className="card">
                <div className="ai-chat" style={{ minHeight: '300px' }}>
                    {messages.length === 0 ? (
                        <div className="empty-state" style={{ padding: '40px 20px' }}>
                            <div className="empty-state-icon"><Icon name="brain" size={48} /></div>
                            <h3>Your AI Productivity Coach</h3>
                            <p>Click &quot;Plan My Next Session&quot; for task priorities, or ask me to edit your timesheets.</p>
                            <div className="agent-examples">
                                <div className="agent-example-label">Try saying:</div>
                                <button className="agent-example-chip" onClick={() => setInput('Change my GBS session yesterday to end at 2:30pm')}>
                                    &quot;Change my GBS session yesterday to end at 2:30pm&quot;
                                </button>
                                <button className="agent-example-chip" onClick={() => setInput('I forgot to clock out of my shift — I actually stopped at 5pm')}>
                                    &quot;I forgot to clock out — I stopped at 5pm&quot;
                                </button>
                                <button className="agent-example-chip" onClick={() => setInput('Split my last session — I took a break from 12-1pm')}>
                                    &quot;Split my last session — I took a break from 12-1pm&quot;
                                </button>
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} className={`ai-message ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                                {/* Show action cards inline */}
                                {msg.actions && msg.actions.length > 0 && (
                                    <div className="agent-actions-card">
                                        <div className="agent-actions-header">
                                            <Icon name="edit" size={14} />
                                            <span>Proposed Changes ({msg.actions.length})</span>
                                        </div>
                                        <div className="agent-actions-list">
                                            {msg.actions.map((action, ai) => (
                                                <div key={ai} className="agent-action-item">
                                                    <span className={`agent-action-badge ${action.type}`}>
                                                        {action.type === 'update_session' ? 'Edit' : action.type === 'create_session' ? 'Create' : 'Delete'}
                                                    </span>
                                                    <span>{action.description}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {pendingActions && pendingActions.messageIndex === i && (
                                            <div className="agent-actions-buttons">
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
                        ))
                    )}

                    {loading && (
                        <div className="ai-message assistant" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div className="loading-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                            Thinking...
                        </div>
                    )}

                    <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className="ai-input-row">
                    <input
                        className="input"
                        placeholder="Ask a question or tell me to edit a timesheet..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                        disabled={loading}
                    />
                    <button className="btn btn-primary" onClick={handleChat} disabled={loading || !input.trim()}>
                        Send
                    </button>
                </div>
            </div>
        </AppLayout>
    );
}
