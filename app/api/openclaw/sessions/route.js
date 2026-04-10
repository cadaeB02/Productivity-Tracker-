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

// GET /api/openclaw/sessions - returns recent sessions (last 7 days by default)
// Supports ?active_only=true to return only running sessions
export async function GET(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const { searchParams } = new URL(request.url);
        const activeOnly = searchParams.get('active_only') === 'true';
        const companyId = searchParams.get('company_id');

        // Active-only mode: return sessions with no end_time
        if (activeOnly) {
            let activeQuery = admin
                .from('sessions')
                .select('id, task_id, project_id, company_id, start_time, end_time, duration, summary, created_at')
                .is('end_time', null)
                .order('start_time', { ascending: false });

            if (companyId) activeQuery = activeQuery.eq('company_id', companyId);

            const { data: activeSessions, error: activeError } = await activeQuery;
            if (activeError) throw activeError;

            // Get company/project/task names for context
            const { data: companies } = await admin.from('companies').select('id, name');
            const { data: projects } = await admin.from('projects').select('id, name');
            const { data: tasks } = await admin.from('tasks').select('id, name');
            const companyMap = {};
            const projectMap = {};
            const taskMap = {};
            (companies || []).forEach(c => { companyMap[c.id] = c.name; });
            (projects || []).forEach(p => { projectMap[p.id] = p.name; });
            (tasks || []).forEach(t => { taskMap[t.id] = t.name; });

            const enriched = (activeSessions || []).map(s => ({
                ...s,
                company: companyMap[s.company_id] || 'Unknown',
                project: projectMap[s.project_id] || 'Unknown',
                task: taskMap[s.task_id] || 'Unknown',
                running_for_minutes: Math.round((Date.now() - new Date(s.start_time).getTime()) / 60000),
            }));

            return NextResponse.json({
                active_count: enriched.length,
                sessions: enriched,
            });
        }

        // Standard mode: return recent sessions
        const days = parseInt(searchParams.get('days') || '7', 10);

        const since = new Date();
        since.setDate(since.getDate() - days);
        since.setHours(0, 0, 0, 0);

        let query = admin
            .from('sessions')
            .select('id, task_id, project_id, company_id, start_time, end_time, duration, summary, ai_summary, is_manual, created_at')
            .gte('start_time', since.toISOString())
            .order('start_time', { ascending: false });

        if (companyId) query = query.eq('company_id', companyId);

        const { data: sessions, error } = await query;
        if (error) throw error;

        // Get company names for context
        const { data: companies } = await admin.from('companies').select('id, name');
        const companyMap = {};
        (companies || []).forEach(c => { companyMap[c.id] = c.name; });

        const totalSeconds = (sessions || []).reduce((s, sess) => s + (sess.duration || 0), 0);

        const enrichedSessions = (sessions || []).map(s => ({
            ...s,
            company: companyMap[s.company_id] || 'Unknown',
            hours: Math.round((s.duration || 0) / 3600 * 100) / 100,
        }));

        return NextResponse.json({
            period_days: days,
            since: since.toISOString().split('T')[0],
            session_count: enrichedSessions.length,
            total_hours: Math.round(totalSeconds / 3600 * 100) / 100,
            sessions: enrichedSessions,
        });
    } catch (err) {
        console.error('OpenClaw sessions error:', err);
        return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }
}

// POST /api/openclaw/sessions - clock in (start a new session)
export async function POST(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const body = await request.json();
        const { task_id, project_id, company_id } = body;

        if (!task_id || !project_id || !company_id) {
            return NextResponse.json({ error: 'task_id, project_id, and company_id are required' }, { status: 400 });
        }

        // Safety check: reject if there's already an active session (HARNESS rule #1)
        const { data: activeSessions } = await admin
            .from('sessions')
            .select('id, company_id, task_id, start_time')
            .is('end_time', null);

        if (activeSessions && activeSessions.length > 0) {
            const active = activeSessions[0];
            // Get names for the error message
            const { data: comp } = await admin.from('companies').select('name').eq('id', active.company_id).single();
            const { data: tsk } = await admin.from('tasks').select('name').eq('id', active.task_id).single();
            return NextResponse.json({
                error: 'Active session already exists — clock out first',
                active_session: {
                    session_id: active.id,
                    company: comp?.name || 'Unknown',
                    task: tsk?.name || 'Unknown',
                    started_at: active.start_time,
                    running_for_minutes: Math.round((Date.now() - new Date(active.start_time).getTime()) / 60000),
                },
            }, { status: 409 });
        }

        // Get user_id from company
        const { data: company } = await admin
            .from('companies')
            .select('user_id')
            .eq('id', company_id)
            .single();

        if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

        const now = new Date().toISOString();

        const { data: session, error } = await admin
            .from('sessions')
            .insert({
                user_id: company.user_id,
                task_id,
                project_id,
                company_id,
                start_time: now,
                end_time: null,
                duration: 0,
            })
            .select()
            .single();

        if (error) throw error;

        // Get names for the response
        const { data: taskData } = await admin.from('tasks').select('name').eq('id', task_id).single();
        const { data: projectData } = await admin.from('projects').select('name').eq('id', project_id).single();
        const { data: companyData } = await admin.from('companies').select('name').eq('id', company_id).single();

        return NextResponse.json({
            success: true,
            message: `Clocked in — ${companyData?.name} / ${projectData?.name} / ${taskData?.name}`,
            session: {
                ...session,
                company: companyData?.name,
                project: projectData?.name,
                task: taskData?.name,
            },
        }, { status: 201 });
    } catch (err) {
        console.error('OpenClaw clock-in error:', err);
        return NextResponse.json({ error: 'Failed to clock in' }, { status: 500 });
    }
}

// PATCH /api/openclaw/sessions - clock out (end an active session)
export async function PATCH(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const body = await request.json();
        const { session_id, summary } = body;

        if (!session_id) {
            return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
        }

        // Get the session to verify it's active
        const { data: session, error: fetchError } = await admin
            .from('sessions')
            .select('*')
            .eq('id', session_id)
            .single();

        if (fetchError || !session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        if (session.end_time) {
            return NextResponse.json({ error: 'Session is already ended' }, { status: 409 });
        }

        // Calculate duration (subtract paused time if any)
        const now = new Date();
        const startTime = new Date(session.start_time);
        const totalSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        const pausedDuration = session.paused_duration || 0;
        const activeDuration = Math.max(0, totalSeconds - pausedDuration);

        const { data: updated, error: updateError } = await admin
            .from('sessions')
            .update({
                end_time: now.toISOString(),
                duration: activeDuration,
                summary: summary || '',
                paused_at: null, // clear any paused state
            })
            .eq('id', session_id)
            .select()
            .single();

        if (updateError) throw updateError;

        // Get names for the response
        const { data: companyData } = await admin.from('companies').select('name').eq('id', updated.company_id).single();
        const { data: taskData } = await admin.from('tasks').select('name').eq('id', updated.task_id).single();

        const hours = Math.round(activeDuration / 3600 * 100) / 100;

        return NextResponse.json({
            success: true,
            message: `Clocked out — ${hours} hours on ${companyData?.name} / ${taskData?.name}`,
            session: {
                ...updated,
                company: companyData?.name,
                task: taskData?.name,
                hours,
            },
        });
    } catch (err) {
        console.error('OpenClaw clock-out error:', err);
        return NextResponse.json({ error: 'Failed to clock out' }, { status: 500 });
    }
}
