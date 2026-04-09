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

// GET /api/openclaw/stats - aggregated hours and earnings data
export async function GET(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        const { searchParams } = new URL(request.url);
        const range = searchParams.get('range') || 'week';
        const companyId = searchParams.get('company_id');

        // Calculate date range
        const now = new Date();
        let since;
        switch (range) {
            case 'today':
                since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'yesterday': {
                const y = new Date(now);
                y.setDate(y.getDate() - 1);
                since = new Date(y.getFullYear(), y.getMonth(), y.getDate());
                break;
            }
            case 'week':
                since = new Date(now);
                since.setDate(now.getDate() - 7);
                break;
            case 'month':
                since = new Date(now);
                since.setMonth(now.getMonth() - 1);
                break;
            case 'all':
                since = new Date(2020, 0, 1);
                break;
            default:
                since = new Date(now);
                since.setDate(now.getDate() - 7);
        }

        // For "yesterday" range, also set an end date
        let until = now;
        if (range === 'yesterday') {
            until = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }

        // Fetch completed sessions
        let query = admin
            .from('sessions')
            .select('id, company_id, duration, start_time, end_time, summary')
            .gte('start_time', since.toISOString())
            .lte('start_time', until.toISOString())
            .not('end_time', 'is', null)
            .order('start_time', { ascending: false });

        if (companyId) query = query.eq('company_id', companyId);

        const { data: sessions, error } = await query;
        if (error) throw error;

        // Get companies for names and pay rates
        const { data: companies } = await admin.from('companies').select('id, name, color, pay_rate');
        const companyMap = {};
        (companies || []).forEach(c => { companyMap[c.id] = c; });

        // Aggregate by company
        const byCompany = {};
        let totalSeconds = 0;

        (sessions || []).forEach(s => {
            const cid = s.company_id;
            if (!byCompany[cid]) {
                const comp = companyMap[cid] || {};
                byCompany[cid] = {
                    company_id: cid,
                    company_name: comp.name || 'Unknown',
                    company_color: comp.color || '#6366f1',
                    pay_rate: comp.pay_rate || null,
                    total_seconds: 0,
                    session_count: 0,
                    sessions: [],
                };
            }
            byCompany[cid].total_seconds += s.duration || 0;
            byCompany[cid].session_count += 1;
            byCompany[cid].sessions.push({
                id: s.id,
                start_time: s.start_time,
                end_time: s.end_time,
                hours: Math.round((s.duration || 0) / 3600 * 100) / 100,
                summary: s.summary || '',
            });
            totalSeconds += s.duration || 0;
        });

        // Calculate earnings
        const companyStats = Object.values(byCompany).map(c => ({
            ...c,
            total_hours: Math.round(c.total_seconds / 3600 * 100) / 100,
            estimated_earnings: c.pay_rate
                ? Math.round((c.total_seconds / 3600) * c.pay_rate * 100) / 100
                : null,
        }));

        // Get active sessions
        const { data: activeSessions } = await admin
            .from('sessions')
            .select('id, company_id, start_time, task_id')
            .is('end_time', null);

        const activeList = (activeSessions || []).map(s => ({
            session_id: s.id,
            company: companyMap[s.company_id]?.name || 'Unknown',
            started_at: s.start_time,
            running_for_minutes: Math.round((Date.now() - new Date(s.start_time).getTime()) / 60000),
        }));

        return NextResponse.json({
            range,
            since: since.toISOString().split('T')[0],
            total_hours: Math.round(totalSeconds / 3600 * 100) / 100,
            total_sessions: (sessions || []).length,
            active_sessions: activeList,
            by_company: companyStats,
        });
    } catch (err) {
        console.error('OpenClaw stats error:', err);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
