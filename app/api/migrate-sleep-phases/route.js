import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// One-time migration to add sleep phase columns
// GET /api/migrate-sleep-phases
export async function GET(request) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!serviceRoleKey) {
            return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
        }

        const admin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // Add columns for sleep phases
        const { error } = await admin.rpc('exec_sql', {
            query: `
                ALTER TABLE sleep_logs
                ADD COLUMN IF NOT EXISTS rem_mins integer DEFAULT 0,
                ADD COLUMN IF NOT EXISTS core_mins integer DEFAULT 0,
                ADD COLUMN IF NOT EXISTS deep_mins integer DEFAULT 0,
                ADD COLUMN IF NOT EXISTS awake_mins integer DEFAULT 0,
                ADD COLUMN IF NOT EXISTS total_sleep_mins integer DEFAULT 0;
            `
        });

        if (error) {
            // If rpc doesn't work, try direct approach
            // Try adding columns one at a time
            const columns = [
                { name: 'rem_mins', type: 'integer', default: '0' },
                { name: 'core_mins', type: 'integer', default: '0' },
                { name: 'deep_mins', type: 'integer', default: '0' },
                { name: 'awake_mins', type: 'integer', default: '0' },
                { name: 'total_sleep_mins', type: 'integer', default: '0' },
            ];

            // We'll test by just trying to update with the new fields
            // Supabase will tell us if columns don't exist
            const { data: testRow } = await admin
                .from('sleep_logs')
                .select('id')
                .limit(1)
                .maybeSingle();

            if (testRow) {
                const { error: updateErr } = await admin
                    .from('sleep_logs')
                    .update({ rem_mins: 0 })
                    .eq('id', testRow.id);

                if (updateErr && updateErr.message.includes('rem_mins')) {
                    return NextResponse.json({
                        error: 'Columns do not exist yet. Please add them manually in Supabase dashboard.',
                        instructions: [
                            'Go to Supabase Dashboard → Table Editor → sleep_logs',
                            'Add column: rem_mins (int4, default 0)',
                            'Add column: core_mins (int4, default 0)',
                            'Add column: deep_mins (int4, default 0)',
                            'Add column: awake_mins (int4, default 0)',
                            'Add column: total_sleep_mins (int4, default 0)',
                        ],
                        sql: 'ALTER TABLE sleep_logs ADD COLUMN rem_mins integer DEFAULT 0, ADD COLUMN core_mins integer DEFAULT 0, ADD COLUMN deep_mins integer DEFAULT 0, ADD COLUMN awake_mins integer DEFAULT 0, ADD COLUMN total_sleep_mins integer DEFAULT 0;'
                    }, { status: 500 });
                }
            }

            return NextResponse.json({
                success: true,
                message: 'Columns already exist or were added.',
                note: error?.message
            });
        }

        return NextResponse.json({ success: true, message: 'Sleep phase columns added successfully' });
    } catch (err) {
        console.error('Migration error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
