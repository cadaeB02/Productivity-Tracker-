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

// GET /api/openclaw/treasury - returns financial summaries per company
export async function GET(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const { searchParams } = new URL(request.url);
        const companyId = searchParams.get('company_id');

        let query = admin
            .from('transactions')
            .select('id, company_id, type, amount, description, category, date')
            .order('date', { ascending: false });

        if (companyId) query = query.eq('company_id', companyId);

        const { data: transactions, error } = await query;
        if (error) throw error;

        // Get company names
        const { data: companies } = await admin.from('companies').select('id, name, color');
        const companyMap = {};
        (companies || []).forEach(c => { companyMap[c.id] = c; });

        // Calculate per-company totals
        const byCompany = {};
        (transactions || []).forEach(t => {
            if (!byCompany[t.company_id]) {
                const comp = companyMap[t.company_id] || {};
                byCompany[t.company_id] = {
                    company_id: t.company_id,
                    company: comp.name || 'Unknown',
                    revenue: 0,
                    expenses: 0,
                    transaction_count: 0,
                };
            }
            const amt = parseFloat(t.amount) || 0;
            if (t.type === 'revenue') byCompany[t.company_id].revenue += amt;
            else byCompany[t.company_id].expenses += amt;
            byCompany[t.company_id].transaction_count += 1;
        });

        const companyBreakdowns = Object.values(byCompany).map(c => ({
            ...c,
            net: Math.round((c.revenue - c.expenses) * 100) / 100,
            revenue: Math.round(c.revenue * 100) / 100,
            expenses: Math.round(c.expenses * 100) / 100,
        }));

        const totalRevenue = companyBreakdowns.reduce((s, c) => s + c.revenue, 0);
        const totalExpenses = companyBreakdowns.reduce((s, c) => s + c.expenses, 0);

        return NextResponse.json({
            total_revenue: totalRevenue,
            total_expenses: totalExpenses,
            net_income: Math.round((totalRevenue - totalExpenses) * 100) / 100,
            transaction_count: (transactions || []).length,
            companies: companyBreakdowns,
        });
    } catch (err) {
        console.error('OpenClaw treasury error:', err);
        return NextResponse.json({ error: 'Failed to fetch treasury data' }, { status: 500 });
    }
}
