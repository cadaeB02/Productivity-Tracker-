import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { plaidClient, PLAID_PRODUCTS, PLAID_COUNTRY_CODES } from '@/lib/plaid';

/**
 * POST /api/plaid/create-link-token
 * Creates a Plaid Link token for the authenticated user.
 * The frontend uses this token to open the Plaid Link UI.
 */
export async function POST() {
    try {
        if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
            return NextResponse.json(
                { error: 'Plaid credentials not configured' },
                { status: 500 }
            );
        }

        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const response = await plaidClient.linkTokenCreate({
            user: { client_user_id: user.id },
            client_name: 'HoldCo OS',
            products: PLAID_PRODUCTS,
            country_codes: PLAID_COUNTRY_CODES,
            language: 'en',
        });

        return NextResponse.json({
            link_token: response.data.link_token,
            expiration: response.data.expiration,
        });
    } catch (error) {
        console.error('Plaid create-link-token error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create link token' },
            { status: 500 }
        );
    }
}
