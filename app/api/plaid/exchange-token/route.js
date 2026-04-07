import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { plaidClient } from '@/lib/plaid';

/**
 * POST /api/plaid/exchange-token
 * Exchanges a Plaid public_token (from Link callback) for a permanent access_token.
 * Stores the access_token and account info in the database.
 *
 * Body: { public_token, institution }
 */
export async function POST(request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { public_token, institution } = await request.json();

        if (!public_token) {
            return NextResponse.json({ error: 'public_token is required' }, { status: 400 });
        }

        // Exchange public token for access token
        const exchangeResponse = await plaidClient.itemPublicTokenExchange({
            public_token,
        });

        const { access_token, item_id } = exchangeResponse.data;

        // Store the Plaid item
        const { data: plaidItem, error: insertError } = await supabase
            .from('plaid_items')
            .insert({
                user_id: user.id,
                access_token,
                item_id,
                institution_name: institution?.name || '',
                institution_id: institution?.institution_id || '',
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // Fetch and store accounts for this item
        const accountsResponse = await plaidClient.accountsGet({ access_token });
        const accounts = accountsResponse.data.accounts;

        const accountInserts = accounts.map((acct) => ({
            user_id: user.id,
            plaid_item_id: plaidItem.id,
            account_id: acct.account_id,
            name: acct.name || '',
            official_name: acct.official_name || '',
            type: acct.type || '',
            subtype: acct.subtype || '',
            mask: acct.mask || '',
            current_balance: acct.balances?.current ?? null,
            available_balance: acct.balances?.available ?? null,
            iso_currency_code: acct.balances?.iso_currency_code || 'USD',
        }));

        if (accountInserts.length > 0) {
            const { error: acctError } = await supabase
                .from('plaid_accounts')
                .insert(accountInserts);
            if (acctError) console.error('Failed to insert accounts:', acctError);
        }

        return NextResponse.json({
            success: true,
            item_id: plaidItem.id,
            institution_name: institution?.name || '',
            accounts_linked: accounts.length,
        });
    } catch (error) {
        console.error('Plaid exchange-token error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to exchange token' },
            { status: 500 }
        );
    }
}
