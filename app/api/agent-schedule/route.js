import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) return null;
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

async function authenticateAgent(request) {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return null;

    const admin = getAdminClient();
    if (!admin) return null;

    const { data: settings } = await admin
        .from('user_settings')
        .select('user_id')
        .eq('agent_token', token.trim())
        .maybeSingle();

    return settings;
}

// GET /api/agent-schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request) {
    try {
        const settings = await authenticateAgent(request);
        if (!settings) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const admin = getAdminClient();
        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        // Fetch schedule blocks
        let blockQuery = admin
            .from('schedule_blocks')
            .select('*, companies(name, color)')
            .eq('user_id', settings.user_id)
            .order('start_time', { ascending: true });

        if (from) blockQuery = blockQuery.or(`date.gte.${from},date.is.null`);
        if (to) blockQuery = blockQuery.or(`date.lte.${to},is_recurring.eq.true`);

        const { data: blocks, error: blockErr } = await blockQuery;
        if (blockErr) throw blockErr;

        // Fetch schedule tasks
        const { data: tasks, error: taskErr } = await admin
            .from('schedule_tasks')
            .select('*')
            .eq('user_id', settings.user_id)
            .neq('status', 'done')
            .order('created_at', { ascending: false });
        if (taskErr) throw taskErr;

        // Fetch auto-clock rules
        const { data: rules, error: ruleErr } = await admin
            .from('auto_clock_rules')
            .select('*, companies(name, color), tasks(name), projects(name)')
            .eq('user_id', settings.user_id)
            .order('day_of_week', { ascending: true });
        if (ruleErr) throw ruleErr;

        // Fetch sleep logs
        let sleepQuery = admin
            .from('sleep_logs')
            .select('*')
            .eq('user_id', settings.user_id)
            .order('date', { ascending: true });
        if (from) sleepQuery = sleepQuery.gte('date', from);
        if (to) sleepQuery = sleepQuery.lte('date', to);

        const { data: sleepLogs, error: sleepErr } = await sleepQuery;
        if (sleepErr) throw sleepErr;

        // Fetch exceptions
        let excQuery = admin
            .from('schedule_blocks')
            .select('exception_date')
            .eq('user_id', settings.user_id)
            .eq('is_exception', true);
        if (from) excQuery = excQuery.gte('exception_date', from);
        if (to) excQuery = excQuery.lte('exception_date', to);

        const { data: exceptions, error: excErr } = await excQuery;
        if (excErr) throw excErr;

        return NextResponse.json({
            blocks: blocks || [],
            tasks: tasks || [],
            auto_clock_rules: rules || [],
            sleep_logs: sleepLogs || [],
            exceptions: (exceptions || []).map(e => e.exception_date),
        });
    } catch (err) {
        console.error('Agent schedule GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/agent-schedule - create/update schedule entries
export async function POST(request) {
    try {
        const settings = await authenticateAgent(request);
        if (!settings) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const admin = getAdminClient();
        const body = await request.json();
        const results = [];

        // Create schedule blocks
        if (body.blocks && Array.isArray(body.blocks)) {
            for (const block of body.blocks) {
                const { data, error } = await admin
                    .from('schedule_blocks')
                    .insert({
                        ...block,
                        user_id: settings.user_id,
                    })
                    .select()
                    .single();
                results.push(error ? { type: 'block', error: error.message } : { type: 'block', id: data.id, status: 'created' });
            }
        }

        // Create schedule tasks
        if (body.tasks && Array.isArray(body.tasks)) {
            for (const task of body.tasks) {
                const { data, error } = await admin
                    .from('schedule_tasks')
                    .insert({
                        ...task,
                        user_id: settings.user_id,
                    })
                    .select()
                    .single();
                results.push(error ? { type: 'task', error: error.message } : { type: 'task', id: data.id, status: 'created' });
            }
        }

        // Add exceptions
        if (body.exceptions && Array.isArray(body.exceptions)) {
            for (const excDate of body.exceptions) {
                const { data, error } = await admin
                    .from('schedule_blocks')
                    .insert({
                        user_id: settings.user_id,
                        is_exception: true,
                        exception_date: excDate,
                        label: '',
                        start_time: '00:00',
                        end_time: '00:00',
                        block_type: 'exception',
                    })
                    .select()
                    .single();
                results.push(error ? { type: 'exception', error: error.message } : { type: 'exception', date: excDate, status: 'created' });
            }
        }

        // Create auto-clock rules
        if (body.auto_clock_rules && Array.isArray(body.auto_clock_rules)) {
            for (const rule of body.auto_clock_rules) {
                const { data, error } = await admin
                    .from('auto_clock_rules')
                    .insert({
                        ...rule,
                        user_id: settings.user_id,
                    })
                    .select()
                    .single();
                results.push(error ? { type: 'auto_clock_rule', error: error.message } : { type: 'auto_clock_rule', id: data.id, status: 'created' });
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (err) {
        console.error('Agent schedule POST error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/agent-schedule - delete schedule blocks/tasks by ID or by date
export async function DELETE(request) {
    try {
        const settings = await authenticateAgent(request);
        if (!settings) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const admin = getAdminClient();
        const { searchParams } = new URL(request.url);
        const results = [];

        // Option 1: Delete by specific IDs (query param or body)
        let ids = searchParams.getAll('id');
        
        // Also accept JSON body with ids array
        if (ids.length === 0) {
            try {
                const body = await request.json();
                if (body.block_ids && Array.isArray(body.block_ids)) ids = body.block_ids;
                if (body.task_ids && Array.isArray(body.task_ids)) {
                    for (const taskId of body.task_ids) {
                        const { error } = await admin
                            .from('schedule_tasks')
                            .delete()
                            .eq('id', taskId)
                            .eq('user_id', settings.user_id);
                        results.push(error
                            ? { type: 'task', id: taskId, error: error.message }
                            : { type: 'task', id: taskId, status: 'deleted' });
                    }
                }
            } catch (_) {
                // No body is fine
            }
        }

        // Delete blocks by ID
        for (const blockId of ids) {
            const { error } = await admin
                .from('schedule_blocks')
                .delete()
                .eq('id', blockId)
                .eq('user_id', settings.user_id);
            results.push(error
                ? { type: 'block', id: blockId, error: error.message }
                : { type: 'block', id: blockId, status: 'deleted' });
        }

        // Option 2: Delete all blocks for a specific date
        const date = searchParams.get('date');
        if (date && ids.length === 0) {
            const { data: deleted, error } = await admin
                .from('schedule_blocks')
                .delete()
                .eq('user_id', settings.user_id)
                .eq('date', date)
                .eq('is_recurring', false)
                .select('id');
            if (error) {
                results.push({ type: 'date_clear', date, error: error.message });
            } else {
                results.push({ type: 'date_clear', date, deleted_count: (deleted || []).length, status: 'cleared' });
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (err) {
        console.error('Agent schedule DELETE error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
