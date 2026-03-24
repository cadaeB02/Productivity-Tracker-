import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Shared auth helper for all OpenClaw routes
function getAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return null;
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

function verifyServerKey(request) {
    const serverKey = process.env.OPENCLAW_SERVER_KEY;
    if (!serverKey) return { error: 'OPENCLAW_SERVER_KEY not configured', status: 500 };

    const auth = request.headers.get('authorization');
    if (!auth || !auth.startsWith('Bearer ')) return { error: 'Missing authorization header', status: 401 };

    const token = auth.replace('Bearer ', '').trim();
    if (token !== serverKey) return { error: 'Invalid server key', status: 403 };

    return null; // auth passed
}

// GET /api/openclaw/tasks — returns today's tasks with project and company info
export async function GET(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Fetch tasks — all active tasks
        const { data: tasks, error: taskError } = await admin
            .from('tasks')
            .select('id, name, company_id, project_id, created_at')
            .order('created_at', { ascending: false });

        if (taskError) throw taskError;

        // Fetch today's sessions to see what's been worked on
        const { data: sessions, error: sessError } = await admin
            .from('sessions')
            .select('task_id, duration, start_time, end_time')
            .gte('start_time', today.toISOString())
            .lt('start_time', tomorrow.toISOString());

        if (sessError) throw sessError;

        // Fetch companies for context
        const { data: companies } = await admin
            .from('companies')
            .select('id, name, color');

        const companyMap = {};
        (companies || []).forEach(c => { companyMap[c.id] = c.name; });

        // Attach session data to tasks
        const sessionsByTask = {};
        (sessions || []).forEach(s => {
            if (!sessionsByTask[s.task_id]) sessionsByTask[s.task_id] = { total_seconds: 0, session_count: 0 };
            sessionsByTask[s.task_id].total_seconds += s.duration || 0;
            sessionsByTask[s.task_id].session_count += 1;
        });

        const enrichedTasks = (tasks || []).map(t => ({
            id: t.id,
            name: t.name,
            company: companyMap[t.company_id] || 'Unknown',
            company_id: t.company_id,
            today_seconds: sessionsByTask[t.id]?.total_seconds || 0,
            today_sessions: sessionsByTask[t.id]?.session_count || 0,
        }));

        return NextResponse.json({
            date: today.toISOString().split('T')[0],
            task_count: enrichedTasks.length,
            tasks_worked_today: Object.keys(sessionsByTask).length,
            tasks: enrichedTasks,
        });
    } catch (err) {
        console.error('OpenClaw tasks error:', err);
        return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }
}
