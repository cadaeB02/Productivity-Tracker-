import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// POST /api/sleep-sync — receive sleep data from iOS Shortcut
// Body: { token: "agent-token", date: "2026-03-23", wake_time: "06:30", sleep_time: "22:15" }
// Or: { token: "agent-token", wake_iso: "2026-03-23T06:30:00Z", sleep_iso: "2026-03-22T22:15:00Z" }
export async function POST(request) {
    try {
        const body = await request.json();
        const { token } = body;

        if (!token) {
            return NextResponse.json({ error: 'Missing token' }, { status: 401 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!serviceRoleKey) {
            return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
        }

        const admin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // Look up token
        const { data: settings } = await admin
            .from('user_settings')
            .select('user_id')
            .eq('agent_token', token.trim())
            .maybeSingle();

        if (!settings) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // Parse date — use today if not provided
        const now = new Date();
        let dateStr = body.date;
        if (!dateStr) {
            dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }

        // Build ISO timestamps
        let wakeISO, sleepISO;

        if (body.wake_iso) {
            wakeISO = body.wake_iso;
        } else if (body.wake_time) {
            wakeISO = new Date(`${dateStr}T${body.wake_time}:00`).toISOString();
        }

        if (body.sleep_iso) {
            sleepISO = body.sleep_iso;
        } else if (body.sleep_time) {
            // Sleep time is usually the night before, so use previous day if sleep > wake
            const sleepDate = body.sleep_date || dateStr;
            sleepISO = new Date(`${sleepDate}T${body.sleep_time}:00`).toISOString();
        }

        if (!wakeISO && !sleepISO) {
            return NextResponse.json({ error: 'Provide wake_time/sleep_time or wake_iso/sleep_iso' }, { status: 400 });
        }

        // Upsert sleep log
        const { data: existing } = await admin
            .from('sleep_logs')
            .select('id')
            .eq('user_id', settings.user_id)
            .eq('date', dateStr)
            .maybeSingle();

        let result;
        if (existing) {
            const updates = {};
            if (wakeISO) updates.wake_time = wakeISO;
            if (sleepISO) updates.sleep_time = sleepISO;
            const { data, error } = await admin
                .from('sleep_logs')
                .update(updates)
                .eq('id', existing.id)
                .select()
                .single();
            result = error ? { error: error.message } : { status: 'updated', id: data.id };
        } else {
            const { data, error } = await admin
                .from('sleep_logs')
                .insert({
                    user_id: settings.user_id,
                    date: dateStr,
                    wake_time: wakeISO,
                    sleep_time: sleepISO,
                })
                .select()
                .single();
            result = error ? { error: error.message } : { status: 'created', id: data.id };
        }

        return NextResponse.json({ success: true, date: dateStr, ...result });
    } catch (err) {
        console.error('Sleep sync error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
