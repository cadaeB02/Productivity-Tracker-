import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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
    if (auth.replace('Bearer ', '').trim() !== serverKey) return { error: 'Invalid server key', status: 403 };
    return null;
}

// GET /api/openclaw/tasks - returns today's tasks with session info
export async function GET(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const { data: tasks, error: taskError } = await admin
            .from('tasks')
            .select('id, name, company_id, project_id, created_at')
            .order('created_at', { ascending: false });
        if (taskError) throw taskError;

        const { data: sessions } = await admin
            .from('sessions')
            .select('task_id, duration, start_time')
            .gte('start_time', today.toISOString())
            .lt('start_time', tomorrow.toISOString());

        const { data: companies } = await admin.from('companies').select('id, name');
        const companyMap = {};
        (companies || []).forEach(c => { companyMap[c.id] = c.name; });

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

// POST /api/openclaw/tasks - create a new task
export async function POST(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const body = await request.json();
        const { name, project_id, company_id } = body;

        if (!name || !project_id || !company_id) {
            return NextResponse.json({ error: 'name, project_id, and company_id are required' }, { status: 400 });
        }

        const { data: company } = await admin
            .from('companies')
            .select('user_id')
            .eq('id', company_id)
            .single();

        if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

        const { data, error } = await admin
            .from('tasks')
            .insert({ name, project_id, company_id, user_id: company.user_id })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, task: data }, { status: 201 });
    } catch (err) {
        console.error('OpenClaw create task error:', err);
        return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
    }
}
