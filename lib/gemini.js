'use client';

import { GoogleGenerativeAI } from '@google/generative-ai';

function getApiKey() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('focusarch_gemini_key') || null;
}

function getClient() {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    return new GoogleGenerativeAI(apiKey);
}

export function hasApiKey() {
    return !!getApiKey();
}

export function setApiKey(key) {
    localStorage.setItem('focusarch_gemini_key', key);
}

export function clearApiKey() {
    localStorage.removeItem('focusarch_gemini_key');
}

export async function generateSessionSummary(taskName, durationSeconds, userNotes) {
    const client = getClient();
    if (!client) throw new Error('No Gemini API key set. Add one in Settings.');

    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);
    const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    const prompt = `You are a concise productivity assistant. I just finished a work session.

Task: ${taskName}
Duration: ${durationStr}
My notes: ${userNotes}

Please:
1. Write a brief, professional log entry summarizing what I accomplished (2-3 sentences max).
2. Suggest 2-3 specific next steps I should tackle in my next session on this task.

Format your response as:
**Session Summary:** [summary]

**Next Steps:**
- [step 1]
- [step 2]
- [step 3]`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}

export async function generatePrioritySuggestions(recentSessions, companyName) {
    const client = getClient();
    if (!client) throw new Error('No Gemini API key set. Add one in Settings.');

    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const sessionSummaries = recentSessions
        .slice(0, 15)
        .map((s) => {
            const date = new Date(s.start_time).toLocaleDateString();
            const hours = (s.duration / 3600).toFixed(1);
            const task = s.tasks?.name || 'Unknown task';
            const summary = s.summary || s.ai_summary || 'No summary';
            return `- ${date}: ${task} (${hours}h) — ${summary}`;
        })
        .join('\n');

    const prompt = `You are a strategic productivity coach. Here is my recent work history${companyName ? ` for ${companyName}` : ''}:

${sessionSummaries}

Based on this history:
1. What patterns do you notice in how I spend my time?
2. What should I prioritize in my next work session to make the most impact?
3. Are there any tasks that seem stalled or need attention?

Be specific, actionable, and concise. Use bullet points.`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}

export async function chatWithAgent(message, context) {
    const client = getClient();
    if (!client) throw new Error('No Gemini API key set. Add one in Settings.');

    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are FocusArch AI, a productivity coach built into a time tracking app. You help users understand their work patterns and prioritize tasks.

Context about the user's recent work:
${context}

User message: ${message}

Respond concisely and helpfully. Use markdown formatting.`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
