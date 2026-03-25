import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `You are the Receipt Editor — an AI assistant embedded in the HoldCo OS Treasury Receipt Scanner. The user has just scanned a document and the AI extracted a batch of line items. Your job is to help the user refine, edit, and correct these items using natural language BEFORE they are saved to the database.

## Context
You will receive the current list of parsed items as a numbered array. Each item has these fields:
- type: "expense" | "revenue" | "note" | "goal"
- vendor: string (entity / company name)
- amount: number
- date: string (YYYY-MM-DD)
- category: string
- description: string
- is_recurring: boolean
- _selected: boolean (whether the item is checked for saving)

## What You Can Do
When the user asks you to change items, respond with JSON containing:
1. "message": A friendly confirmation of what you changed
2. "updates": An array of update objects, each with:
   - "index": the 0-based index of the item to update
   - "changes": an object with the field names and new values to apply

## Examples

User: "Item #3 is actually a recurring expense on the 18th of every month"
Response: { "message": "Got it! I've marked item #3 as a recurring monthly expense.", "updates": [{ "index": 2, "changes": { "is_recurring": true, "type": "expense" } }] }

User: "Change items 5 through 8 to the Travel category"
Response: { "message": "Done! Items 5-8 are now categorized as Travel.", "updates": [{ "index": 4, "changes": { "category": "Travel" } }, { "index": 5, "changes": { "category": "Travel" } }, { "index": 6, "changes": { "category": "Travel" } }, { "index": 7, "changes": { "category": "Travel" } }] }

User: "Delete item #2, that's not real"
Response: { "message": "Removed item #2 from the batch.", "updates": [{ "index": 1, "changes": { "_selected": false } }] }

User: "Mark items 1, 4, and 7 as revenue instead of expense"
Response: { "message": "Items 1, 4, and 7 are now marked as revenue.", "updates": [{ "index": 0, "changes": { "type": "revenue" } }, { "index": 3, "changes": { "type": "revenue" } }, { "index": 6, "changes": { "type": "revenue" } }] }

## Rules
- Item numbers from the user are 1-indexed. Convert to 0-indexed for the "index" field.
- If the user says "delete" an item, set _selected to false (deselect it, don't remove it).
- If the user references an item number that doesn't exist, say so politely.
- Always respond with ONLY valid JSON. No markdown fences, no explanation text outside the JSON.
- Be concise in your message. 1-2 sentences max.
- Today's date is ${new Date().toISOString().split('T')[0]}`;

export async function POST(request) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not configured.' }, { status: 500 });
        }

        const { messages, items } = await request.json();

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
        }

        // Build context from current items
        const itemContext = (items || []).map((item, i) =>
            `${i + 1}. [${item._selected ? '✓' : '✗'}] ${item.type} | ${item.vendor} | $${item.amount} | ${item.date} | ${item.category} | "${item.description}" | recurring: ${item.is_recurring ? 'yes' : 'no'}`
        ).join('\n');

        const fullPrompt = SYSTEM_PROMPT + `\n\n## Current Items (${(items || []).length} total):\n${itemContext}`;

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash-lite',
            systemInstruction: { role: 'user', parts: [{ text: fullPrompt }] },
        });

        // Build chat history
        const userMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
        let firstUserIdx = userMessages.findIndex(m => m.role === 'user');
        if (firstUserIdx < 0) firstUserIdx = 0;
        const validMessages = userMessages.slice(firstUserIdx);

        const chatHistory = validMessages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }],
        }));

        const chat = model.startChat({
            history: chatHistory.slice(0, -1),
        });

        const lastMessage = messages[messages.length - 1].content;

        // Retry with exponential backoff for 429 rate limits
        const MAX_RETRIES = 3;
        let lastError = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const result = await chat.sendMessage(lastMessage);
                const responseText = result.response.text().trim();

                // Parse JSON response
                let cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
                if (!cleaned.startsWith('{')) {
                    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
                    if (jsonMatch) cleaned = jsonMatch[0];
                }

                let parsed;
                try {
                    parsed = JSON.parse(cleaned);
                } catch {
                    const cleanMsg = responseText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
                    parsed = { message: cleanMsg || responseText, updates: [] };
                }

                return NextResponse.json({ success: true, data: parsed });
            } catch (err) {
                lastError = err;
                const is429 = err.message?.includes('429') || err.message?.includes('Resource exhausted');

                if (is429 && attempt < MAX_RETRIES - 1) {
                    const delay = Math.pow(2, attempt + 1) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                break;
            }
        }

        console.error('Receipt editor error after retries:', lastError);
        return NextResponse.json(
            { error: lastError?.message || 'Failed to process request' },
            { status: 500 }
        );
    } catch (error) {
        console.error('Receipt editor error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process request' },
            { status: 500 }
        );
    }
}
