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

// GET /api/openclaw/companies - list all companies with entity info and project counts
export async function GET(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const { searchParams } = new URL(request.url);
        const entitiesOnly = searchParams.get('entities_only') === 'true';

        let query = admin
            .from('companies')
            .select('*')
            .order('created_at', { ascending: true });

        if (entitiesOnly) query = query.eq('is_entity', true);

        const { data: companies, error } = await query;
        if (error) throw error;

        // Get project counts per company
        const { data: projects } = await admin
            .from('projects')
            .select('id, company_id');

        // Get task counts per company
        const { data: tasks } = await admin
            .from('tasks')
            .select('id, company_id');

        // Get active sessions
        const { data: activeSessions } = await admin
            .from('sessions')
            .select('id, company_id')
            .is('end_time', null);

        const projectCounts = {};
        const taskCounts = {};
        const activeSessionCounts = {};

        (projects || []).forEach(p => {
            projectCounts[p.company_id] = (projectCounts[p.company_id] || 0) + 1;
        });
        (tasks || []).forEach(t => {
            taskCounts[t.company_id] = (taskCounts[t.company_id] || 0) + 1;
        });
        (activeSessions || []).forEach(s => {
            activeSessionCounts[s.company_id] = (activeSessionCounts[s.company_id] || 0) + 1;
        });

        const enriched = (companies || []).map(c => ({
            id: c.id,
            name: c.name,
            color: c.color,
            company_type: c.company_type,
            // Pay config
            pay_rate: c.pay_rate,
            pay_type: c.pay_type,
            pay_period: c.pay_period,
            // Entity info
            is_entity: c.is_entity,
            legal_name: c.legal_name || null,
            ein: c.ein || null,
            state_of_formation: c.state_of_formation || null,
            formation_date: c.formation_date || null,
            state_renewal_date: c.state_renewal_date || null,
            registered_agent: c.registered_agent || null,
            domains: c.domains || [],
            // Counts
            project_count: projectCounts[c.id] || 0,
            task_count: taskCounts[c.id] || 0,
            active_sessions: activeSessionCounts[c.id] || 0,
        }));

        return NextResponse.json({
            company_count: enriched.length,
            companies: enriched,
        });
    } catch (err) {
        console.error('OpenClaw companies error:', err);
        return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
    }
}
