import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

/**
 * Shared Plaid client configuration.
 * Env vars required:
 *   PLAID_CLIENT_ID
 *   PLAID_SECRET
 *   PLAID_ENV  (sandbox | development | production)
 */

const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

const configuration = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
        },
    },
});

export const plaidClient = new PlaidApi(configuration);
export const PLAID_PRODUCTS = ['transactions'];
export const PLAID_COUNTRY_CODES = ['US'];
