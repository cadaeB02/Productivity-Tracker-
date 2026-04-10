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

// GET /api/openclaw/expenses - list transactions with optional filters
export async function GET(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const { searchParams } = new URL(request.url);
        const companyId = searchParams.get('company_id');
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const type = searchParams.get('type');
        const limit = parseInt(searchParams.get('limit') || '50', 10);

        let query = admin
            .from('transactions')
            .select('id, company_id, type, amount, description, category, date, vendor_id, is_recurring, created_at')
            .order('date', { ascending: false })
            .limit(limit);

        if (companyId) query = query.eq('company_id', companyId);
        if (type) query = query.eq('type', type);
        if (from) query = query.gte('date', from);
        if (to) query = query.lte('date', to);

        const { data: transactions, error } = await query;
        if (error) throw error;

        // Get company names
        const { data: companies } = await admin.from('companies').select('id, name');
        const companyMap = {};
        (companies || []).forEach(c => { companyMap[c.id] = c.name; });

        const enriched = (transactions || []).map(t => ({
            ...t,
            company: companyMap[t.company_id] || 'Unknown',
        }));

        const totalExpenses = enriched.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0);
        const totalRevenue = enriched.filter(t => t.type === 'revenue').reduce((s, t) => s + parseFloat(t.amount), 0);

        return NextResponse.json({
            transaction_count: enriched.length,
            total_expenses: Math.round(totalExpenses * 100) / 100,
            total_revenue: Math.round(totalRevenue * 100) / 100,
            transactions: enriched,
        });
    } catch (err) {
        console.error('OpenClaw list expenses error:', err);
        return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
    }
}

// POST /api/openclaw/expenses - add a transaction (expense or revenue)
export async function POST(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const body = await request.json();
        const { company_id, type, amount, description, category, date } = body;

        if (!company_id || !amount) {
            return NextResponse.json({ error: 'company_id and amount are required' }, { status: 400 });
        }

        if (type && !['revenue', 'expense'].includes(type)) {
            return NextResponse.json({ error: 'type must be "revenue" or "expense"' }, { status: 400 });
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

        const { data, error } = await admin
            .from('transactions')
            .insert({
                user_id: company.user_id,
                company_id,
                type: type || 'expense',
                amount: parseFloat(amount),
                description: description || '',
                category: category || '',
                date: date || new Date().toISOString().split('T')[0],
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, transaction: data }, { status: 201 });
    } catch (err) {
        console.error('OpenClaw create expense error:', err);
        return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
    }
}
