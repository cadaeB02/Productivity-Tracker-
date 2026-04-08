import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Receive Apple Calendar events from the local sync script
export async function POST(request) {
    try {
        const { events, userId, email, syncKey } = await request.json();
        
        // Resolve user ID from email if not provided directly
        let resolvedUserId = userId;
        if (!resolvedUserId && email) {
            const { data: users } = await supabase.auth.admin.listUsers();
            const user = users?.users?.find(u => u.email === email);
            if (user) resolvedUserId = user.id;
        }

        if (!events || !resolvedUserId) {
            return NextResponse.json({ error: 'Missing events or userId/email' }, { status: 400 });
        }

        // Verify sync key matches (simple auth)
        const expectedKey = process.env.APPLE_CALENDAR_SYNC_KEY;
        if (expectedKey && syncKey !== expectedKey) {
            return NextResponse.json({ error: 'Invalid sync key' }, { status: 403 });
        }

        // Upsert into a calendar_events table-like structure in localStorage-backed cache
        // For now, store in a simple cache approach via Supabase
        const { error } = await supabase
            .from('calendar_cache')
            .upsert({
                user_id: resolvedUserId,
                events_json: JSON.stringify(events),
                event_count: events.length,
                synced_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

        if (error) {
            // Table might not exist yet - create a lightweight response
            console.error('Calendar cache upsert error:', error);
            // Fall back to returning the events for client-side caching
            return NextResponse.json({ 
                status: 'ok_client_cache',
                message: 'Events received but DB cache unavailable. Client will cache locally.',
                count: events.length,
            });
        }

        return NextResponse.json({ 
            status: 'synced',
            count: events.length,
            synced_at: new Date().toISOString(),
        });
    } catch (err) {
        console.error('Apple Calendar sync error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// Retrieve cached Apple Calendar events
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('uid');
        
        if (!userId) {
            return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
        }

        // Try Supabase cache first
        const { data, error } = await supabase
            .from('calendar_cache')
            .select('events_json, event_count, synced_at')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            return NextResponse.json({ events: [], synced_at: null, source: 'none' });
        }

        return NextResponse.json({
            events: JSON.parse(data.events_json || '[]'),
            count: data.event_count,
            synced_at: data.synced_at,
            source: 'supabase_cache',
        });
    } catch (err) {
        console.error('Apple Calendar fetch error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
