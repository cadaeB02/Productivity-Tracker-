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

// GET /api/openclaw/notes - read/search notes
export async function GET(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');
        const companyId = searchParams.get('company_id');
        const search = searchParams.get('search');
        const flaggedOnly = searchParams.get('flagged') === 'true';
        const limit = parseInt(searchParams.get('limit') || '50', 10);

        let query = admin
            .from('notes')
            .select('*')
            .order('pinned', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(limit);

        if (category) query = query.eq('category', category);
        if (companyId) query = query.eq('company_id', companyId);
        if (flaggedOnly) query = query.eq('flagged', true);
        if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);

        const { data: notes, error } = await query;
        if (error) throw error;

        return NextResponse.json({
            count: (notes || []).length,
            notes: notes || [],
        });
    } catch (err) {
        console.error('OpenClaw notes read error:', err);
        return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }
}

// POST /api/openclaw/notes - create a note with full metadata
export async function POST(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const body = await request.json();
        const { content, title, category, company_id, pinned, flagged } = body;

        if (!content && !title) {
            return NextResponse.json({ error: 'content or title is required' }, { status: 400 });
        }

        // Get user_id — use first company or first user in system
        let userId;
        if (company_id) {
            const { data: company } = await admin
                .from('companies')
                .select('user_id')
                .eq('id', company_id)
                .single();
            userId = company?.user_id;
        }
        if (!userId) {
            const { data: anyCompany } = await admin
                .from('companies')
                .select('user_id')
                .limit(1)
                .single();
            userId = anyCompany?.user_id;
        }

        if (!userId) {
            return NextResponse.json({ error: 'No users found in system' }, { status: 500 });
        }

        const { data, error } = await admin
            .from('notes')
            .insert({
                user_id: userId,
                content: content || '',
                title: title || '',
                category: category || 'inbox',
                company_id: company_id || null,
                pinned: pinned || false,
                flagged: flagged || false,
            })
            .select()
            .single();
        if (error) throw error;

        return NextResponse.json({ success: true, note: data }, { status: 201 });
    } catch (err) {
        console.error('OpenClaw notes create error:', err);
        return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }
}
