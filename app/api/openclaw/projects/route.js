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

// GET /api/openclaw/projects - list all projects, optionally filtered by company_id
export async function GET(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const { searchParams } = new URL(request.url);
        const companyId = searchParams.get('company_id');

        let query = admin
            .from('projects')
            .select('id, name, company_id, created_at')
            .order('created_at', { ascending: true });

        if (companyId) query = query.eq('company_id', companyId);

        const { data: projects, error } = await query;
        if (error) throw error;

        // Get company names
        const { data: companies } = await admin.from('companies').select('id, name');
        const companyMap = {};
        (companies || []).forEach(c => { companyMap[c.id] = c.name; });

        // Get task counts per project
        const { data: tasks } = await admin.from('tasks').select('id, project_id');
        const taskCounts = {};
        (tasks || []).forEach(t => {
            taskCounts[t.project_id] = (taskCounts[t.project_id] || 0) + 1;
        });

        const enriched = (projects || []).map(p => ({
            ...p,
            company: companyMap[p.company_id] || 'Unknown',
            task_count: taskCounts[p.id] || 0,
        }));

        return NextResponse.json({
            project_count: enriched.length,
            projects: enriched,
        });
    } catch (err) {
        console.error('OpenClaw list projects error:', err);
        return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }
}

// POST /api/openclaw/projects - create or update a project
export async function POST(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const body = await request.json();
        const { name, company_id, id } = body;

        if (!company_id) {
            return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
        }

        // Get user_id from company
        const { data: company } = await admin
            .from('companies')
            .select('user_id')
            .eq('id', company_id)
            .single();

        if (!company) {
            return NextResponse.json({ error: 'Company not found' }, { status: 404 });
        }

        if (id) {
            // Update existing project
            const { data, error } = await admin
                .from('projects')
                .update({ name })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return NextResponse.json({ success: true, project: data });
        } else {
            // Create new project
            if (!name) return NextResponse.json({ error: 'name is required for new projects' }, { status: 400 });
            const { data, error } = await admin
                .from('projects')
                .insert({
                    name,
                    company_id,
                    user_id: company.user_id,
                })
                .select()
                .single();
            if (error) throw error;
            return NextResponse.json({ success: true, project: data }, { status: 201 });
        }
    } catch (err) {
        console.error('OpenClaw project error:', err);
        return NextResponse.json({ error: 'Failed to manage project' }, { status: 500 });
    }
}
