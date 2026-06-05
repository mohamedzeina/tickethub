import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_KEY!, {
	apiVersion: '2026-05-27.dahlia',
});

// Settlement currency. MUST match the platform Stripe account's currency, or
// source_transaction transfers fail ("balance transaction (eur) must match
// transfer currency"). Our platform account is German → EUR. Charges and seller
// transfers both use this so amounts and balances line up.
export const CURRENCY = (process.env.STRIPE_CURRENCY || 'eur').toLowerCase();
