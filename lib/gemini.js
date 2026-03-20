'use client';

import { GoogleGenerativeAI } from '@google/generative-ai';

function getApiKey() {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('parallax_gemini_key') || null;
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
    localStorage.setItem('parallax_gemini_key', key);
}

export function clearApiKey() {
    localStorage.removeItem('parallax_gemini_key');
}

export async function generateSessionSummary(taskName, durationSeconds, userNotes) {
    const client = getClient();
    if (!client) throw new Error('No Gemini API key set. Add one in Settings.');

    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are Parallax AI, a productivity coach built into a time tracking app. You help users understand their work patterns and prioritize tasks.

Context about the user's recent work:
${context}

User message: ${message}

Respond concisely and helpfully. Use markdown formatting.`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}

/**
 * Chat with the agent with the ability to propose timesheet edits.
 * Returns { text, actions } where actions is an array of proposed changes.
 */
export async function chatWithAgentActions(message, sessionContext, companiesContext) {
    const client = getClient();
    if (!client) throw new Error('No Gemini API key set. Add one in Settings.');

    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are Parallax AI, a productivity assistant built into a time tracking app called Parallax. You can both answer questions AND propose changes to timesheets.

AVAILABLE COMPANIES, PROJECTS, AND TASKS:
${companiesContext}

RECENT SESSIONS (with IDs and timestamps):
${sessionContext}

CURRENT DATE/TIME: ${new Date().toLocaleString()}

USER REQUEST: ${message}

INSTRUCTIONS:
1. First, write a brief, friendly explanation of what you understand and what changes you're proposing. Use markdown formatting.
2. If the user is asking you to edit, fix, split, or create timesheet entries, include a JSON block with proposed actions.
3. If the user is just asking a question (not requesting changes), respond normally without any JSON block.

AVAILABLE ACTIONS (use in the JSON block):
- update_session: Change start_time, end_time, or both on an existing session
- create_session: Create a new session with task_id, project_id, company_id, start_time, end_time
- delete_session: Remove a session by ID

For times, use ISO format like "2026-03-20T09:26:00".
For session references, use the session ID from the context above.
For new sessions, use company_id, project_id, and task_id from the available context above.

If proposing actions, end your response with a JSON block in this exact format:
\`\`\`json
{
  "actions": [
    {
      "type": "update_session",
      "session_id": "uuid-here",
      "description": "Human readable description of this change",
      "updates": {
        "start_time": "2026-03-20T09:26:00",
        "end_time": "2026-03-20T14:30:00"
      }
    },
    {
      "type": "create_session",
      "description": "Human readable description",
      "company_id": "uuid",
      "project_id": "uuid",
      "task_id": "uuid",
      "start_time": "2026-03-20T16:00:00",
      "end_time": "2026-03-20T18:00:00"
    },
    {
      "type": "delete_session",
      "session_id": "uuid-here",
      "description": "Human readable description"
    }
  ]
}
\`\`\`

IMPORTANT RULES:
- Always explain what you're doing BEFORE the JSON block
- Only propose actions when the user explicitly asks for changes
- Use real IDs from the session context — never make up IDs
- For splitting a session: update the original session's end_time, then create a new session for the resumed period
- Be precise with times — use the exact times the user mentions
- If you're unsure about which session to edit, ask for clarification instead of guessing`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse actions from the response if present
    const actions = parseActionsFromResponse(responseText);
    const cleanText = responseText.replace(/```json\s*\{[\s\S]*?\}\s*```/g, '').trim();

    return { text: cleanText, actions };
}

function parseActionsFromResponse(text) {
    try {
        const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        if (!jsonMatch) return null;

        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.actions && Array.isArray(parsed.actions) && parsed.actions.length > 0) {
            return parsed.actions;
        }
        return null;
    } catch (err) {
        console.warn('Failed to parse AI actions:', err);
        return null;
    }
}

