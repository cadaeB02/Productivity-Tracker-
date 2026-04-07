import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { plaidClient } from '@/lib/plaid';

/**
 * GET /api/plaid/get-accounts
 * Returns all linked Plaid bank accounts with current balances.
 * Refreshes balances from Plaid if ?refresh=true is passed.
 */
export async function GET(request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const shouldRefresh = searchParams.get('refresh') === 'true';

        // If refresh requested, update balances from Plaid first
        if (shouldRefresh) {
            const { data: items } = await supabase
                .from('plaid_items')
                .select('*')
                .eq('user_id', user.id)
                .eq('status', 'active');

            for (const item of (items || [])) {
                try {
                    const response = await plaidClient.accountsGet({
                        access_token: item.access_token,
                    });

                    for (const acct of response.data.accounts) {
                        await supabase
                            .from('plaid_accounts')
                            .update({
                                current_balance: acct.balances?.current ?? null,
                                available_balance: acct.balances?.available ?? null,
                                name: acct.name || undefined,
                                official_name: acct.official_name || undefined,
                                updated_at: new Date().toISOString(),
                            })
                            .eq('account_id', acct.account_id)
                            .eq('user_id', user.id);
                    }
                } catch (err) {
                    console.error(`Balance refresh failed for item ${item.id}:`, err);
                }
            }
        }

        // Fetch all accounts with their parent item info
        const { data: accounts, error: acctError } = await supabase
            .from('plaid_accounts')
            .select('*, plaid_items(institution_name, status, error_code)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });

        if (acctError) throw acctError;

        // Also fetch items for the overview
        const { data: items } = await supabase
            .from('plaid_items')
            .select('id, institution_name, status, error_code, created_at, updated_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });

        return NextResponse.json({
            accounts: accounts || [],
            items: items || [],
        });
    } catch (error) {
        console.error('Plaid get-accounts error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get accounts' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/plaid/get-accounts
 * Disconnects a Plaid item (bank connection).
 * Body: { plaid_item_id }
 */
export async function DELETE(request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { plaid_item_id } = await request.json();
        if (!plaid_item_id) {
            return NextResponse.json({ error: 'plaid_item_id required' }, { status: 400 });
        }

        // Get the item to remove from Plaid
        const { data: item } = await supabase
            .from('plaid_items')
            .select('access_token')
            .eq('id', plaid_item_id)
            .eq('user_id', user.id)
            .single();

        if (!item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        // Remove from Plaid
        try {
            await plaidClient.itemRemove({ access_token: item.access_token });
        } catch (err) {
            console.error('Plaid itemRemove error (continuing with local delete):', err);
        }

        // Delete accounts first (foreign key)
        await supabase
            .from('plaid_accounts')
            .delete()
            .eq('plaid_item_id', plaid_item_id);

        // Delete the item
        await supabase
            .from('plaid_items')
            .delete()
            .eq('id', plaid_item_id)
            .eq('user_id', user.id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Plaid disconnect error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to disconnect' },
            { status: 500 }
        );
    }
}
