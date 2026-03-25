import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
        }

        const formData = await request.formData();
        const file = formData.get('receipt');

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        const mimeType = file.type || 'image/jpeg';

        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = `Analyze this document (which may be a single receipt, an invoice, or a multi-page bank statement) and extract all financial transactions or notable items.

Return an ARRAY of JSON objects. Even if there is only 1 item, return it inside an array [ {...} ].

For each item found, determine its type:
1. "expense": Money going out (purchases, fees, bills).
2. "revenue": Money coming in (deposits, payouts, sales).

For each object in the array, strictly follow this JSON structure:
{
    "type": "expense" | "revenue",
    "vendor": "Store/Company/Entity name (if applicable)",
    "amount": total amount as a number (no currency symbol, use 0 if none),
    "date": "YYYY-MM-DD format (infer year if missing based on document context, or use current year)",
    "category": one of ["Food & Dining", "Software & Tools", "Office", "Travel", "Gas & Auto", "Shopping", "Entertainment", "Utilities", "Marketing", "Contractors", "Paycheck", "Other"] (try your best to categorize),
    "description": "A short summary of what this item is (e.g., 'Office Supplies' or 'Client Payment')",
    "tax": tax amount as number or null,
    "confidence": a number 0-100 indicating your confidence in extracting this specific row,
    "is_recurring": true/false - does this look like a recurring subscription or regular monthly charge?,
    "card_last_four": "if a credit/debit card number is visible (even partially like ****0290 or ending in 0290), extract the last 4 digits as a string. Otherwise null."
}

Important Rules:
- If reading a bank statement with 45 rows, return an array of 45 objects.
- If reading a single receipt or invoice, consolidate into ONE single main expense/revenue object using the grand total amount.
- Only respond with a valid JSON array, no markdown fences or explanation text.`;

        // Retry with exponential backoff for 429 rate limits
        const MAX_RETRIES = 3;
        let lastError = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const result = await model.generateContent([
                    { text: prompt },
                    { inlineData: { mimeType, data: base64 } },
                ]);

                const responseText = result.response.text().trim();
                const cleaned = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');

                let parsed;
                try {
                    parsed = JSON.parse(cleaned);
                } catch {
                    return NextResponse.json({ error: 'Failed to parse AI response', raw: responseText }, { status: 500 });
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

        console.error('Receipt analysis error after retries:', lastError);
        return NextResponse.json(
            { error: lastError?.message || 'Failed to analyze receipt' },
            { status: 500 }
        );
    } catch (error) {
        console.error('Receipt analysis error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to analyze receipt' },
            { status: 500 }
        );
    }
}
