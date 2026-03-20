import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { token } = await request.json();

        if (!token || typeof token !== 'string' || token.trim().length < 10) {
            return NextResponse.json({ error: 'Invalid agent token' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!serviceRoleKey) {
            console.error('SUPABASE_SERVICE_ROLE_KEY is not set');
            return NextResponse.json({ error: 'Agent auth is not configured on this server' }, { status: 500 });
        }

        // Use service role client to bypass RLS and look up the token
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // Find user_settings row with matching agent_token
        const { data: settings, error: settingsError } = await supabaseAdmin
            .from('user_settings')
            .select('user_id, agent_name')
            .eq('agent_token', token.trim())
            .maybeSingle();

        if (settingsError) {
            console.error('Agent auth lookup error:', settingsError);
            return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
        }

        if (!settings) {
            return NextResponse.json({ error: 'Invalid or expired agent token' }, { status: 401 });
        }

        // Get the user's email to generate a magic link
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(settings.user_id);

        if (userError || !userData?.user) {
            console.error('Failed to look up user:', userError);
            return NextResponse.json({ error: 'User not found' }, { status: 500 });
        }

        // Generate a magic link for this user (signs them in without password)
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: userData.user.email,
        });

        if (linkError) {
            console.error('Failed to generate magic link:', linkError);
            return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
        }

        // Extract the hashed token from the action link and return it
        // The client will use this to verify the OTP and establish a session
        const actionLink = linkData?.properties?.action_link;
        const url = new URL(actionLink);
        const hashedToken = url.searchParams.get('token');
        const tokenType = url.searchParams.get('type');

        return NextResponse.json({
            success: true,
            email: userData.user.email,
            token_hash: hashedToken,
            token_type: tokenType,
            agent_name: settings.agent_name || 'AI Agent',
        });
    } catch (err) {
        console.error('Agent auth error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
