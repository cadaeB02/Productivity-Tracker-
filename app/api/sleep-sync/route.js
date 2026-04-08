import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// POST /api/sleep-sync - receive sleep data from iOS Shortcut
// Body options:
// Simple: { token, date, wake_time: "06:30", sleep_time: "22:15" }
// With phases: { token, date, wake_time, sleep_time, rem_mins, core_mins, deep_mins, awake_mins }
// ISO: { token, wake_iso, sleep_iso, rem_mins, core_mins, deep_mins, awake_mins }
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

        // Parse date - use today in Mountain Time if not provided
        let dateStr = body.date;
        if (!dateStr) {
            const now = new Date();
            const mtDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Denver' }));
            dateStr = `${mtDate.getFullYear()}-${String(mtDate.getMonth() + 1).padStart(2, '0')}-${String(mtDate.getDate()).padStart(2, '0')}`;
        }

        const source = body.source || 'ios_shortcut';

        // Build ISO timestamps - keep times in Mountain Time context
        let wakeISO, sleepISO;

        if (body.wake_iso) {
            wakeISO = body.wake_iso;
        } else if (body.wake_time) {
            wakeISO = `${dateStr}T${body.wake_time}:00-06:00`;
        }

        if (body.sleep_iso) {
            sleepISO = body.sleep_iso;
        } else if (body.sleep_time) {
            const sleepDate = body.sleep_date || dateStr;
            sleepISO = `${sleepDate}T${body.sleep_time}:00-06:00`;
        }

        if (!wakeISO && !sleepISO) {
            return NextResponse.json({ error: 'Provide wake_time/sleep_time or wake_iso/sleep_iso' }, { status: 400 });
        }

        // Parse phase data
        const remMins = parseInt(body.rem_mins) || 0;
        const coreMins = parseInt(body.core_mins) || 0;
        const deepMins = parseInt(body.deep_mins) || 0;
        const awakeMins = parseInt(body.awake_mins) || 0;
        const totalSleepMins = parseInt(body.total_sleep_mins) || (remMins + coreMins + deepMins);

        // Upsert sleep log
        const { data: existing } = await admin
            .from('sleep_logs')
            .select('id')
            .eq('user_id', settings.user_id)
            .eq('date', dateStr)
            .maybeSingle();

        let result;
        const record = {
            source,
            ...(wakeISO && { wake_time: wakeISO }),
            ...(sleepISO && { sleep_time: sleepISO }),
            ...(remMins > 0 && { rem_mins: remMins }),
            ...(coreMins > 0 && { core_mins: coreMins }),
            ...(deepMins > 0 && { deep_mins: deepMins }),
            ...(awakeMins > 0 && { awake_mins: awakeMins }),
            ...(totalSleepMins > 0 && { total_sleep_mins: totalSleepMins }),
        };

        if (existing) {
            const { data, error } = await admin
                .from('sleep_logs')
                .update(record)
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
                    ...record,
                })
                .select()
                .single();
            result = error ? { error: error.message } : { status: 'created', id: data.id };
        }

        return NextResponse.json({
            success: true,
            date: dateStr,
            source,
            phases: { rem_mins: remMins, core_mins: coreMins, deep_mins: deepMins, awake_mins: awakeMins, total_sleep_mins: totalSleepMins },
            ...result,
        });
    } catch (err) {
        console.error('Sleep sync error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
