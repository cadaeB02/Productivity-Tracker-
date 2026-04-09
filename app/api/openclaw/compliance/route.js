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

// GET /api/openclaw/compliance - entity compliance data
export async function GET(request) {
    const authError = verifyServerKey(request);
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

    const admin = getAdminClient();
    if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

    try {
        // Get all entities (companies with is_entity = true)
        const { data: entities, error } = await admin
            .from('companies')
            .select('*')
            .eq('is_entity', true)
            .order('name', { ascending: true });
        if (error) throw error;

        // Get equity holders for each entity
        const entityIds = (entities || []).map(e => e.id);
        const { data: holders } = await admin
            .from('equity_holders')
            .select('*')
            .in('company_id', entityIds.length > 0 ? entityIds : ['none'])
            .order('percentage', { ascending: false });

        // Get recent equity transfers
        const { data: transfers } = await admin
            .from('equity_transfers')
            .select('*')
            .in('company_id', entityIds.length > 0 ? entityIds : ['none'])
            .order('transferred_at', { ascending: false })
            .limit(20);

        // Compute compliance alerts
        const now = new Date();
        const alerts = [];

        (entities || []).forEach(e => {
            if (e.state_renewal_date) {
                const renewalDate = new Date(e.state_renewal_date);
                const daysUntil = Math.ceil((renewalDate - now) / (1000 * 60 * 60 * 24));
                if (daysUntil <= 30) {
                    alerts.push({
                        entity: e.name,
                        type: 'state_renewal',
                        date: e.state_renewal_date,
                        days_until: daysUntil,
                        urgency: daysUntil <= 7 ? 'critical' : daysUntil <= 14 ? 'high' : 'medium',
                        message: `${e.legal_name || e.name} state renewal due in ${daysUntil} days (${e.state_renewal_date})`,
                    });
                }
            }
            if (!e.ein) {
                alerts.push({
                    entity: e.name,
                    type: 'missing_ein',
                    urgency: 'high',
                    message: `${e.legal_name || e.name} has no EIN on file`,
                });
            }
            if (!e.registered_agent) {
                alerts.push({
                    entity: e.name,
                    type: 'missing_registered_agent',
                    urgency: 'medium',
                    message: `${e.legal_name || e.name} has no registered agent on file`,
                });
            }
        });

        const holdersByEntity = {};
        (holders || []).forEach(h => {
            if (!holdersByEntity[h.company_id]) holdersByEntity[h.company_id] = [];
            holdersByEntity[h.company_id].push({
                id: h.id,
                name: h.holder_name,
                percentage: h.percentage,
                role: h.role,
            });
        });

        const enriched = (entities || []).map(e => ({
            id: e.id,
            name: e.name,
            legal_name: e.legal_name,
            ein: e.ein,
            state_of_formation: e.state_of_formation,
            formation_date: e.formation_date,
            state_renewal_date: e.state_renewal_date,
            registered_agent: e.registered_agent,
            domains: e.domains || [],
            equity_holders: holdersByEntity[e.id] || [],
        }));

        return NextResponse.json({
            entity_count: enriched.length,
            entities: enriched,
            alerts: alerts.sort((a, b) => (a.days_until || 999) - (b.days_until || 999)),
            recent_transfers: transfers || [],
        });
    } catch (err) {
        console.error('OpenClaw compliance error:', err);
        return NextResponse.json({ error: 'Failed to fetch compliance data' }, { status: 500 });
    }
}
