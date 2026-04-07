'use client';

import { GoogleGenerativeAI } from '@google/generative-ai';

// ── AI Mode: 'cloud' | 'local' | 'auto' ──
// cloud = always use Gemini
// local = always use Ollama
// auto = suggestive/background tasks use local, explicit chat uses cloud

const AI_MODE_KEY = 'holdco-ai-mode';
const OLLAMA_URL_KEY = 'holdco-ollama-url';
const OLLAMA_MODEL_KEY = 'holdco-ollama-model';

export function getAiMode() {
    if (typeof window === 'undefined') return 'cloud';
    return localStorage.getItem(AI_MODE_KEY) || 'auto';
}

export function setAiMode(mode) {
    localStorage.setItem(AI_MODE_KEY, mode);
}

export function getOllamaConfig() {
    if (typeof window === 'undefined') return { url: 'http://localhost:11434', model: 'cade-assistant' };
    return {
        url: localStorage.getItem(OLLAMA_URL_KEY) || 'http://localhost:11434',
        model: localStorage.getItem(OLLAMA_MODEL_KEY) || 'cade-assistant',
    };
}

export function setOllamaConfig(url, model) {
    if (url) localStorage.setItem(OLLAMA_URL_KEY, url);
    if (model) localStorage.setItem(OLLAMA_MODEL_KEY, model);
}

export function hasLocalAi() {
    const config = getOllamaConfig();
    return !!config.url;
}

// ── HoldCo OS System Prompt for Local AI ──
const HOLDCO_SYSTEM_PROMPT = `You are the HoldCo OS AI Assistant — an intelligent productivity and business operations assistant built into the HoldCo OS platform.

PLATFORM CONTEXT:
HoldCo OS is a comprehensive productivity and business management platform built by Cade Bergthold for managing multiple business entities under Bergthold Ventures LLC (DBA "Digital Mechanic"). The platform includes:

- **Timer**: Time tracking with company/project/task hierarchy. Click-to-clock sessions.
- **Schedule**: Calendar with planned blocks, sleep tracking, WhenIWork iCal integration, Apple Calendar sync.
- **Treasury**: Financial tracking — revenue, expenses, receipt scanning with AI, Plaid bank sync.
- **Filing**: Document management with vendor tech stack pipeline view. Vendors organized by category (AI, Hosting, Marketing, etc.).
- **Compliance**: Business entity compliance — EINs, registered agents, annual filings.
- **Projects**: Project and task management across companies.
- **Stats**: Analytics dashboard with hours, earnings, and productivity metrics.
- **Notes**: Quick capture notes system.
- **Nerve Center**: Central dashboard with company overview tiles.
- **Personal Agent**: Multimodal AI chat with timesheet editing actions and image analysis.

COMPANIES/ENTITIES:
- Bergthold Ventures LLC (parent holding company)
- Digital Mechanic (DBA — web development and tech services)
- PocketGC (contractor platform startup)
- Physical jobs: Golden Bike Shop, Bentgate Mountaineering

YOUR ROLE:
- Help with scheduling, time management, and productivity optimization
- Analyze work patterns and suggest improvements
- Assist with financial tracking and expense categorization
- Generate concise, actionable summaries and suggestions
- Be aware of the user's multi-company workflow
- Keep responses concise and use markdown formatting
- When unsure, ask for clarification rather than guessing`;

// ── Ollama API Call ──
async function callOllama(prompt, systemPrompt = HOLDCO_SYSTEM_PROMPT) {
    const config = getOllamaConfig();
    const response = await fetch(`${config.url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: config.model,
            prompt: prompt,
            system: systemPrompt,
            stream: false,
            options: {
                temperature: 0.7,
                num_predict: 1024,
            },
        }),
    });
    if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} — is Ollama running at ${config.url}?`);
    }
    const data = await response.json();
    return data.response || '';
}

// ── Decide which AI to use ──
// 'suggestive' = background/auto tasks (summaries, naming, proactive suggestions)
// 'explicit' = user-initiated chat conversations
function shouldUseLocal(taskType = 'suggestive') {
    const mode = getAiMode();
    if (mode === 'cloud') return false;
    if (mode === 'local') return true;
    // auto mode: suggestive → local, explicit → cloud
    return taskType === 'suggestive';
}

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

export function hasAnyAi() {
    return hasApiKey() || hasLocalAi();
}

export function setApiKey(key) {
    localStorage.setItem('parallax_gemini_key', key);
}

export function clearApiKey() {
    localStorage.removeItem('parallax_gemini_key');
}

export async function generateSessionSummary(taskName, durationSeconds, userNotes) {
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);
    const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    const prompt = `I just finished a work session.

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

    // Suggestive task — use local if available
    if (shouldUseLocal('suggestive') && hasLocalAi()) {
        return callOllama(prompt);
    }

    const client = getClient();
    if (!client) throw new Error('No AI configured. Add a Gemini API key or connect Ollama in Settings.');
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
}

export async function generatePrioritySuggestions(recentSessions, companyName) {
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

    const prompt = `Here is my recent work history${companyName ? ` for ${companyName}` : ''}:

${sessionSummaries}

Based on this history:
1. What patterns do you notice in how I spend my time?
2. What should I prioritize in my next work session to make the most impact?
3. Are there any tasks that seem stalled or need attention?

Be specific, actionable, and concise. Use bullet points.`;

    if (shouldUseLocal('suggestive') && hasLocalAi()) {
        return callOllama(prompt);
    }

    const client = getClient();
    if (!client) throw new Error('No AI configured. Add a Gemini API key or connect Ollama in Settings.');
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
}

export async function chatWithAgent(message, context) {
    const prompt = `Context about the user's recent work:
${context}

User message: ${message}

Respond concisely and helpfully. Use markdown formatting.`;

    // Chat is explicit — but schedule chat could be suggestive
    if (shouldUseLocal('suggestive') && hasLocalAi()) {
        return callOllama(prompt);
    }

    const client = getClient();
    if (!client) throw new Error('No AI configured. Add a Gemini API key or connect Ollama in Settings.');
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
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
- update_company: Update a company's settings (pay_rate, pay_period, pay_period_start, paycheck_delay_days, tax_federal_rate, tax_state_rate, tax_fica_rate, tax_deductions_pretax)

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
    },
    {
      "type": "update_company",
      "company_id": "uuid-here",
      "description": "Human readable description",
      "updates": {
        "paycheck_delay_days": 5,
        "pay_period_start": "2026-03-31"
      }
    }
  ]
}
\`\`\`

IMPORTANT RULES:
- Always explain what you're doing BEFORE the JSON block
- Use the confirmation pattern - propose changes and ask if they sound good
- Use real IDs from the session context - never make up IDs
- For splitting a session: update the original session's end_time, then create a new session for the resumed period
- Be precise with times - use the exact times the user mentions or that you extract from images
- If you're unsure about which session to edit or which company/project/task to use, ask for clarification
- When parsing images, describe what you see so the user can verify accuracy
- For paycheck date issues: the paycheck date = period end + paycheck_delay_days. Adjust paycheck_delay_days or pay_period_start to fix the date.
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
    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const dismissedList = dismissedSuggestions.length > 0
        ? `\nDO NOT suggest any of the following (user already dismissed these):\n${dismissedSuggestions.map(s => `- "${s}"`).join('\n')}\n`
        : '';

    const prompt = `Generate ONE short, actionable, context-aware suggestion for the user.

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
- Do NOT use emojis or em dashes. Use plain text only.`;

    // Proactive suggestions are always suggestive — use local
    if (shouldUseLocal('suggestive') && hasLocalAi()) {
        try {
            const text = await callOllama(prompt);
            if (text === 'null' || text.length < 5) return null;
            return text.trim();
        } catch (err) {
            console.warn('Local proactive suggestion failed:', err);
            return null;
        }
    }

    const client = getClient();
    if (!client) return null;
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
    const prompt = `Generate a clean, human-readable display name for this document/file.

FILE NAME: ${fileName}
CATEGORY: ${category || 'general'}
DESCRIPTION: ${description || 'none provided'}

RULES:
- Return ONLY the display name, nothing else
- Format: "[Short Date] — [Concise Summary]"
- Example outputs:
  "Apr 3 — Digital Mechanic Hosting — $280"
  "Mar 25 — Twilio Account Funding — $20"
  "Apr 1 — Garrett Righele Payment — $250"
  "Mar 15 — LLC Operating Agreement"
- Use short month format (Jan, Feb, Mar...)
- Keep the summary to 3-6 words max
- Strip out file extensions, UUIDs, hashes, and random characters`;

    // Doc naming is suggestive — use local if no image
    if (!imageBase64 && shouldUseLocal('suggestive') && hasLocalAi()) {
        try {
            const text = await callOllama(prompt);
            return text.replace(/^["']|["']$/g, '').trim();
        } catch (err) {
            console.warn('Local doc name generation failed:', err);
            return null;
        }
    }

    const client = getClient();
    if (!client) return null;
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const parts = [];
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

