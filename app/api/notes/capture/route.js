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

// POST /api/notes/capture — fast capture from iOS Shortcut or OpenClaw
// Accepts: { text, category?, company_id?, title? }
// Auth: OpenClaw server key OR agent token
export async function POST(request) {
    // Check for OpenClaw key first
    const serverKey = process.env.OPENCLAW_SERVER_KEY;
    const auth = request.headers.get('authorization');

    if (!auth || !auth.startsWith('Bearer ') || !serverKey) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (auth.replace('Bearer ', '').trim() !== serverKey) {
        return NextResponse.json({ error: 'Invalid key' }, { status: 403 });
    }

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const body = await request.json();
        const { text, category, company_id, title } = body;

        if (!text || text.trim().length === 0) {
            return NextResponse.json({ error: 'text is required' }, { status: 400 });
        }

        // SECURITY: Never allow capturing into passwords category via API
        const safeCategory = category && category !== 'passwords' ? category : 'inbox';

        // Get user_id — for single-user app, get the first user from companies
        const { data: firstCompany } = await admin
            .from('companies')
            .select('user_id')
            .limit(1)
            .single();

        if (!firstCompany) {
            return NextResponse.json({ error: 'No user found' }, { status: 404 });
        }

        const { data, error } = await admin
            .from('notes')
            .insert({
                user_id: firstCompany.user_id,
                company_id: company_id || null,
                category: safeCategory,
                title: title || '',
                content: text.trim(),
                is_encrypted: false,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            note_id: data.id,
            category: data.category,
            message: `Note captured to ${data.category}`,
        }, { status: 201 });
    } catch (err) {
        console.error('Note capture error:', err);
        return NextResponse.json({ error: 'Failed to capture note' }, { status: 500 });
    }
}
