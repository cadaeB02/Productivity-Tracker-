import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Auto-clock endpoint: called by cron or external trigger to auto-start sessions
// POST /api/auto-clock - checks rules and starts sessions if conditions match
export async function POST(request) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!serviceRoleKey) {
            return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun,1=Mon,...6=Sat
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

        // Get all active auto-clock rules for today's day of week
        const { data: rules, error: rulesErr } = await supabaseAdmin
            .from('auto_clock_rules')
            .select('*, companies(name)')
            .eq('day_of_week', dayOfWeek)
            .eq('is_active', true);

        if (rulesErr) {
            console.error('Failed to fetch auto-clock rules:', rulesErr);
            return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
        }

        if (!rules || rules.length === 0) {
            return NextResponse.json({ message: 'No rules for today', triggered: 0 });
        }

        const results = [];

        for (const rule of rules) {
            // Check if the time matches (within 5 min window)
            const [ruleHour, ruleMinute] = rule.start_time.split(':').map(Number);
            const ruleMinutes = ruleHour * 60 + ruleMinute;
            const currentMinutes = currentHour * 60 + currentMinute;
            const timeDiff = Math.abs(currentMinutes - ruleMinutes);

            if (timeDiff > 5) {
                results.push({ rule_id: rule.id, status: 'skipped', reason: 'time_mismatch' });
                continue;
            }

            // Check for exceptions on today's date
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const { data: exceptions } = await supabaseAdmin
                .from('schedule_blocks')
                .select('id')
                .eq('is_exception', true)
                .eq('exception_date', todayStr)
                .eq('user_id', rule.user_id)
                .limit(1);

            if (exceptions && exceptions.length > 0) {
                results.push({ rule_id: rule.id, status: 'skipped', reason: 'exception_day' });
                continue;
            }

            // Check if there's already an active session for this task
            const { data: activeSessions } = await supabaseAdmin
                .from('sessions')
                .select('id')
                .eq('user_id', rule.user_id)
                .eq('task_id', rule.task_id)
                .is('end_time', null)
                .limit(1);

            if (activeSessions && activeSessions.length > 0) {
                results.push({ rule_id: rule.id, status: 'skipped', reason: 'already_active' });
                continue;
            }

            // Start the session
            const { data: session, error: sessErr } = await supabaseAdmin
                .from('sessions')
                .insert({
                    user_id: rule.user_id,
                    task_id: rule.task_id,
                    project_id: rule.project_id,
                    company_id: rule.company_id,
                    start_time: now.toISOString(),
                })
                .select()
                .single();

            if (sessErr) {
                results.push({ rule_id: rule.id, status: 'error', error: sessErr.message });
            } else {
                results.push({
                    rule_id: rule.id,
                    status: 'started',
                    session_id: session.id,
                    company: rule.companies?.name || '',
                });
            }
        }

        const triggered = results.filter(r => r.status === 'started').length;
        return NextResponse.json({ message: `Auto-clock complete`, triggered, results });
    } catch (err) {
        console.error('Auto-clock error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET /api/auto-clock - check status of auto-clock rules
export async function GET(request) {
    try {
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!serviceRoleKey) {
            return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // Look up token
        const { data: settings } = await supabaseAdmin
            .from('user_settings')
            .select('user_id')
            .eq('agent_token', token.trim())
            .maybeSingle();

        if (!settings) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const { data: rules, error } = await supabaseAdmin
            .from('auto_clock_rules')
            .select('*, companies(name, color), tasks(name), projects(name)')
            .eq('user_id', settings.user_id)
            .order('day_of_week', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ rules: rules || [] });
    } catch (err) {
        console.error('Auto-clock GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
