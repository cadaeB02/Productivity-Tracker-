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

// GET /api/openclaw/sessions — returns recent sessions (last 7 days by default)
export async function GET(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') || '7', 10);
        const companyId = searchParams.get('company_id');

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
