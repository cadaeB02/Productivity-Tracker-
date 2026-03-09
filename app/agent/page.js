'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/Icon';
import { getSessions, getCompanies } from '@/lib/store';
import { generatePrioritySuggestions, chatWithAgent, hasApiKey } from '@/lib/gemini';
import { formatDurationShort } from '@/lib/utils';

export default function AgentPage() {
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState('');
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasKey, setHasKey] = useState(false);
    const chatEndRef = useRef(null);

    useEffect(() => {
        setHasKey(hasApiKey());
        loadCompanies();
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadCompanies = async () => {
        try {
            const c = await getCompanies();
            setCompanies(c);
        } catch (err) {
            console.error(err);
        }
    };

    const buildContext = async () => {
        try {
            const filters = {};
            if (selectedCompany) filters.companyId = selectedCompany;
            const sessions = await getSessions(filters);
            const recent = sessions.slice(0, 20);
            return recent.map((s) => {
                const date = new Date(s.start_time).toLocaleDateString();
                const hours = (s.duration / 3600).toFixed(1);
                const task = s.tasks?.name || 'Unknown';
                const company = s.companies?.name || '';
                const summary = s.summary || s.ai_summary || 'No summary';
                return `${date}: ${company} - ${task} (${hours}h) — ${summary}`;
            }).join('\n');
        } catch {
            return 'No session history available.';
        }
    };

    const handlePlanSession = async () => {
        if (!hasKey) {
            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: 'No Gemini API key found. Please add one in **Settings** first.',
            }]);
            return;
        }

        setLoading(true);
        const companyName = selectedCompany
            ? companies.find((c) => c.id === selectedCompany)?.name
            : null;

        setMessages((prev) => [...prev, {
            role: 'user',
            content: `Plan my next session${companyName ? ` for ${companyName}` : ''}`,
        }]);

        try {
            const filters = {};
            if (selectedCompany) filters.companyId = selectedCompany;
            const sessions = await getSessions(filters);
            const response = await generatePrioritySuggestions(sessions, companyName);
            setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
        } catch (err) {
            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: `Error: ${err.message}`,
            }]);
        }
        setLoading(false);
    };

    const handleChat = async () => {
        if (!input.trim() || loading) return;
        if (!hasKey) {
            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: 'No Gemini API key found. Please add one in **Settings** first.',
            }]);
            return;
        }

        const userMessage = input.trim();
        setInput('');
        setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            const context = await buildContext();
            const response = await chatWithAgent(userMessage, context);
            setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
        } catch (err) {
            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: `Error: ${err.message}`,
            }]);
        }
        setLoading(false);
    };

    return (
        <AppLayout>
            <div className="page-header">
                <h2><Icon name="robot" size={24} className="icon-inline" /> AI Agent</h2>
                <p>Get AI-powered productivity insights and planning</p>
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
                        onClick={() => setMessages([])}
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
                            <p>Click &quot;Plan My Next Session&quot; to get task priorities based on your work history, or type a question below.</p>
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} className={`ai-message ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
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
                        placeholder="Ask about your productivity, priorities, or work patterns..."
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
