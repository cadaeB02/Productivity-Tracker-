import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { plaidClient } from '@/lib/plaid';

/**
 * Plaid category → HoldCo OS category mapping.
 * Plaid uses detailed hierarchical categories; we map to our simpler set.
 */
const CATEGORY_MAP = {
    'Food and Drink': 'Food & Dining',
    'Travel': 'Travel',
    'Transportation': 'Gas & Auto',
    'Shops': 'Shopping',
    'Recreation': 'Entertainment',
    'Service': 'Software & Tools',
    'Payment': 'Other',
    'Transfer': 'Other',
    'Tax': 'Other',
    'Bank Fees': 'Other',
};

function mapPlaidCategory(plaidCategories) {
    if (!plaidCategories || plaidCategories.length === 0) return 'Other';
    const primary = plaidCategories[0];
    return CATEGORY_MAP[primary] || 'Other';
}

/**
 * POST /api/plaid/sync-transactions
 * Uses Plaid's /transactions/sync endpoint to incrementally sync transactions.
 * Deduplicates against existing Plaid-sourced transactions.
 *
 * Body: { plaid_item_id?, company_id? }
 *   - plaid_item_id: sync a specific bank connection (optional, syncs all if omitted)
 *   - company_id: assign synced transactions to this company (optional)
 */
export async function POST(request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const targetItemId = body.plaid_item_id;
        const defaultCompanyId = body.company_id;

        // Get plaid items to sync
        let query = supabase
            .from('plaid_items')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'active');

        if (targetItemId) {
            query = query.eq('id', targetItemId);
        }

        const { data: items, error: itemsError } = await query;
        if (itemsError) throw itemsError;

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'No active bank connections found' }, { status: 404 });
        }

        let totalAdded = 0;
        let totalModified = 0;
        let totalRemoved = 0;
        const errors = [];

        // Build account → company mapping
        const { data: plaidAccounts } = await supabase
            .from('plaid_accounts')
            .select('account_id, company_id, id')
            .eq('user_id', user.id);

        const accountMap = {};
        (plaidAccounts || []).forEach(a => {
            accountMap[a.account_id] = { company_id: a.company_id, db_id: a.id };
        });

        for (const item of items) {
            try {
                let hasMore = true;
                let cursor = item.cursor || '';

                while (hasMore) {
                    const syncResponse = await plaidClient.transactionsSync({
                        access_token: item.access_token,
                        cursor: cursor || undefined,
                        count: 100,
                    });

                    const { added, modified, removed, next_cursor, has_more } = syncResponse.data;

                    // Process added transactions
                    for (const txn of added) {
                        // Check for duplicate
                        const { data: existing } = await supabase
                            .from('transactions')
                            .select('id')
                            .eq('plaid_transaction_id', txn.transaction_id)
                            .maybeSingle();

                        if (existing) continue; // Skip duplicate

                        const acctInfo = accountMap[txn.account_id] || {};
                        const companyId = acctInfo.company_id || defaultCompanyId;

                        if (!companyId) continue; // Skip if no company to assign to

                        // Plaid amounts: positive = money out (expense), negative = money in (revenue)
                        const isExpense = txn.amount > 0;

                        await supabase.from('transactions').insert({
                            user_id: user.id,
                            company_id: companyId,
                            type: isExpense ? 'expense' : 'revenue',
                            amount: Math.abs(txn.amount),
                            description: txn.name || txn.merchant_name || '',
                            category: mapPlaidCategory(txn.category),
                            date: txn.date,
                            source: 'plaid',
                            plaid_transaction_id: txn.transaction_id,
                            plaid_account_id: acctInfo.db_id || null,
                            is_recurring: txn.personal_finance_category?.primary === 'LOAN_PAYMENTS'
                                || txn.personal_finance_category?.primary === 'RENT_AND_UTILITIES'
                                || false,
                        });

                        totalAdded++;
                    }

                    // Process modified transactions (update existing)
                    for (const txn of modified) {
                        const { data: existing } = await supabase
                            .from('transactions')
                            .select('id')
                            .eq('plaid_transaction_id', txn.transaction_id)
                            .maybeSingle();

                        if (existing) {
                            const isExpense = txn.amount > 0;
                            await supabase
                                .from('transactions')
                                .update({
                                    amount: Math.abs(txn.amount),
                                    description: txn.name || txn.merchant_name || '',
                                    category: mapPlaidCategory(txn.category),
                                    date: txn.date,
                                    type: isExpense ? 'expense' : 'revenue',
                                })
                                .eq('id', existing.id);
                            totalModified++;
                        }
                    }

                    // Process removed transactions
                    for (const txn of removed) {
                        const { data: existing } = await supabase
                            .from('transactions')
                            .select('id')
                            .eq('plaid_transaction_id', txn.transaction_id)
                            .maybeSingle();

                        if (existing) {
                            await supabase
                                .from('transactions')
                                .delete()
                                .eq('id', existing.id);
                            totalRemoved++;
                        }
                    }

                    cursor = next_cursor;
                    hasMore = has_more;
                }

                // Save the cursor for next sync
                await supabase
                    .from('plaid_items')
                    .update({ cursor, updated_at: new Date().toISOString() })
                    .eq('id', item.id);

                // Also update account balances while we're at it
                try {
                    const balanceResponse = await plaidClient.accountsGet({
                        access_token: item.access_token,
                    });
                    for (const acct of balanceResponse.data.accounts) {
                        await supabase
                            .from('plaid_accounts')
                            .update({
                                current_balance: acct.balances?.current ?? null,
                                available_balance: acct.balances?.available ?? null,
                                updated_at: new Date().toISOString(),
                            })
                            .eq('account_id', acct.account_id)
                            .eq('user_id', user.id);
                    }
                } catch (balErr) {
                    console.error('Failed to update balances:', balErr);
                }

            } catch (itemError) {
                console.error(`Sync error for item ${item.id}:`, itemError);

                // Update item status if there's a Plaid error
                const plaidError = itemError?.response?.data?.error_code;
                if (plaidError) {
                    await supabase
                        .from('plaid_items')
                        .update({
                            status: 'error',
                            error_code: plaidError,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', item.id);
                }

                errors.push({
                    item_id: item.id,
                    institution: item.institution_name,
                    error: itemError.message,
                });
            }
        }

        return NextResponse.json({
            success: true,
            added: totalAdded,
            modified: totalModified,
            removed: totalRemoved,
            items_synced: items.length - errors.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error('Plaid sync-transactions error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to sync transactions' },
            { status: 500 }
        );
    }
}
