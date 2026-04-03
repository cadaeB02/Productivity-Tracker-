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
 * Supports multimodal input — images are sent alongside text via Gemini vision.
 * Returns { text, actions } where actions is an array of proposed changes.
 */
export async function chatWithAgentActions(message, sessionContext, companiesContext, images = []) {
    const client = getClient();
    if (!client) throw new Error('No Gemini API key set. Add one in Settings.');

    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are the Personal Agent — an intelligent productivity assistant built into a time tracking app called HoldCo OS (Parallax). You deeply understand the user's companies, projects, and tasks, and you help them manage their work life efficiently.

YOU CAN SEE IMAGES. When the user attaches images (screenshots, photos of timesheets, receipts, schedules, etc.), analyze them carefully and extract relevant information.

AVAILABLE COMPANIES, PROJECTS, AND TASKS:
${companiesContext}

RECENT SESSIONS (with IDs and timestamps):
${sessionContext}

CURRENT DATE/TIME: ${new Date().toLocaleString()}

USER MESSAGE: ${message}
${images.length > 0 ? `\nThe user has attached ${images.length} image(s). Analyze them carefully and extract any relevant information (times, dates, shift schedules, amounts, etc.).\n` : ''}

CORE BEHAVIOR — CONFIRMATION PATTERN:
When you want to make changes (create/update/delete sessions, add data), ALWAYS:
1. First explain what you see/understand from the user's message (and images if attached)
2. Clearly state what changes you plan to make, in plain language
3. Ask "Does this sound good?" or similar confirmation
4. Include the JSON action block so the user can approve with one click

If the user says "yes", "do it", "sounds good", "go ahead", etc. — treat as confirmation and apply the previously proposed actions.

AVAILABLE ACTIONS (use in the JSON block):
- update_session: Change start_time, end_time, or both on an existing session
- create_session: Create a new session with task_id, project_id, company_id, start_time, end_time, summary
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
      "end_time": "2026-03-20T18:00:00",
      "summary": "Optional session summary"
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
- Use the confirmation pattern — propose changes and ask if they sound good
- Use real IDs from the session context — never make up IDs
- For splitting a session: update the original session's end_time, then create a new session for the resumed period
- Be precise with times — use the exact times the user mentions or that you extract from images
- If you're unsure about which session to edit or which company/project/task to use, ask for clarification
- When parsing images, describe what you see so the user can verify accuracy
- Be friendly, concise, and use markdown formatting`;

    // Build content parts — text + optional images
    const parts = [];

    // Add images first if present
    for (const img of images) {
        if (img.startsWith('data:')) {
            const [meta, base64] = img.split(',');
            const mimeMatch = meta.match(/data:(.*?);/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            parts.push({
                inlineData: {
                    data: base64,
                    mimeType,
                },
            });
        }
    }

    // Add text prompt
    parts.push({ text: prompt });

    const result = await model.generateContent(parts);
    const responseText = result.response.text();

    // Parse actions from the response if present
    const actions = parseActionsFromResponse(responseText);
    const cleanText = responseText.replace(/```json\s*\{[\s\S]*?\}\s*```/g, '').trim();

    return { text: cleanText, actions };
}

/**
 * Generate a proactive suggestion based on current context.
 * Returns a string suggestion or null if nothing relevant.
 */
export async function generateProactiveSuggestion(sessionContext, companiesContext, activeSessions, dismissedSuggestions = []) {
    const client = getClient();
    if (!client) return null;

    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const dismissedList = dismissedSuggestions.length > 0
        ? `\nDO NOT suggest any of the following (user already dismissed these):\n${dismissedSuggestions.map(s => `- "${s}"`).join('\n')}\n`
        : '';

    const prompt = `You are the Personal Agent for HoldCo OS. Generate ONE short, actionable, context-aware suggestion for the user.

CURRENT TIME: ${dayName}, ${timeStr}
ACTIVE SESSIONS: ${activeSessions.length > 0 ? activeSessions.map(s => `${s.companies?.name || 'Unknown'} (running)`).join(', ') : 'None running'}

COMPANIES & STRUCTURE:
${companiesContext}

RECENT SESSIONS:
${sessionContext}
${dismissedList}
RULES:
- Return ONLY the suggestion text (1-2 sentences max), nothing else
- Make it specific and actionable based on the current time, day, and recent patterns
- Don't be generic - reference specific companies, times, or patterns you notice
- If nothing useful to suggest, return exactly: null
- Do NOT use emojis or em dashes. Use plain text only.
- Examples of good suggestions:
  "It's ${timeStr} on ${dayName}. You usually clock into Golden Bike Shop around now. Want me to start a session?"
  "You logged 3 shifts at GBS this week but I only see 2 sessions recorded. Missing one?"
  "Your last session ended 3 hours ago. Ready to start the next one?"
  "You've tracked 32 hours this week across 3 companies. Want a weekly summary?"`;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        if (text === 'null' || text.length < 5) return null;
        return text;
    } catch (err) {
        console.warn('Proactive suggestion failed:', err);
        return null;
    }
}

/**
 * Generate a clean, human-readable display name for a document/receipt.
 * Uses the filename, description, category, and optionally the image itself.
 * Returns a string like "Apr 3 — TDM Hosting Payment — $280"
 */
export async function generateDocumentName(fileName, description, category, imageBase64 = null) {
    const client = getClient();
    if (!client) return null;

    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Generate a clean, human-readable display name for this document/file.

FILE NAME: ${fileName}
CATEGORY: ${category || 'general'}
DESCRIPTION: ${description || 'none provided'}
${imageBase64 ? 'An image of the document is attached — use it to extract relevant details.' : ''}

RULES:
- Return ONLY the display name, nothing else
- Format: "[Short Date] — [Concise Summary]"
- Example outputs:
  "Apr 3 — Digital Mechanic Hosting — $280"
  "Mar 25 — Twilio Account Funding — $20"
  "Apr 1 — Garrett Righele Payment — $250"
  "Mar 15 — LLC Operating Agreement"
  "Feb 20 — Q4 Tax Filing"
- Use short month format (Jan, Feb, Mar...)
- Extract the date from the filename or description if possible
- Keep the summary to 3-6 words max
- Include dollar amount if it's a receipt/invoice and amount is visible
- Strip out file extensions, UUIDs, hashes, and random characters
- If you can identify the vendor/company, use a short but recognizable name
- Don't include "Receipt" or "Invoice" in the name since the category already shows that`;

    const parts = [];

    // Add image if available
    if (imageBase64) {
        const [meta, base64] = imageBase64.split(',');
        const mimeMatch = meta.match(/data:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        parts.push({ inlineData: { data: base64, mimeType } });
    }

    parts.push({ text: prompt });

    try {
        const result = await model.generateContent(parts);
        const text = result.response.text().trim();
        // Clean up any quotes the model might add
        return text.replace(/^["']|["']$/g, '');
    } catch (err) {
        console.warn('Document name generation failed:', err);
        return null;
    }
}

// ── Dismissed suggestions storage ──

const DISMISSED_KEY = 'parallax_dismissed_suggestions';
const DISMISS_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getDismissedSuggestions() {
    if (typeof window === 'undefined') return [];
    try {
        const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
        const now = Date.now();
        // Filter out expired ones
        const valid = stored.filter(s => now - s.timestamp < DISMISS_EXPIRY_MS);
        // Clean up expired
        if (valid.length !== stored.length) {
            localStorage.setItem(DISMISSED_KEY, JSON.stringify(valid));
        }
        return valid.map(s => s.text);
    } catch {
        return [];
    }
}

export function dismissSuggestion(text) {
    if (typeof window === 'undefined') return;
    try {
        const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
        stored.push({ text, timestamp: Date.now() });
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(stored));
    } catch {}
}

// ── Internal helpers ──

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

