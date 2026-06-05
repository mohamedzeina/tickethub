import express, { Request, Response } from 'express';
import { requireAuth } from '@zeina-tickethub/common';
import { ConnectedAccount } from '../models/connected-account';
import { stripe } from '../stripe';

const router = express.Router();

// #11 Phase 1 — Stripe Connect (Express) onboarding for sellers.
//
// Two endpoints, no money moves yet:
//   POST /api/payments/connect/onboard → create (or reuse) the seller's Express
//        account and hand back a one-time Stripe-hosted onboarding URL.
//   GET  /api/payments/connect/status  → refresh readiness flags from Stripe and
//        report whether the seller can be paid out.
//
// Selling is NOT gated on this (decision: hold-and-collect) — a seller can list
// and sell before connecting; Phase 2 holds their earnings until payoutsEnabled
// flips true here.

// The seller returns here after the hosted flow. We derive the absolute base URL
// from the request (behind the ingress, trust-proxy gives https + the real host),
// so it auto-adapts between tickethub.com locally and the prod domain — no env.
const baseUrl = (req: Request) => `${req.protocol}://${req.get('host')}`;

// POST /api/payments/connect/onboard
router.post(
	'/api/payments/connect/onboard',
	requireAuth,
	async (req: Request, res: Response) => {
		const userId = req.currentUser!.id;

		const existing = await ConnectedAccount.findOne({ userId });

		// First time: create the Express account. Stripe owns KYC/identity/bank
		// verification; we only store the acct_… id. metadata.userId lets a future
		// account.updated webhook (Phase 3) map back to our user.
		let stripeAccountId: string;
		if (existing) {
			stripeAccountId = existing.stripeAccountId;
		} else {
			const stripeAccount = await stripe.accounts.create({
				type: 'express',
				metadata: { userId },
			});
			stripeAccountId = stripeAccount.id;
			await ConnectedAccount.build({ userId, stripeAccountId }).save();
		}

		// One-time onboarding link. refresh_url is hit if the link expires before
		// the seller finishes; return_url is where Stripe sends them when done.
		const accountLink = await stripe.accountLinks.create({
			account: stripeAccountId,
			type: 'account_onboarding',
			refresh_url: `${baseUrl(req)}/account?payouts=refresh`,
			return_url: `${baseUrl(req)}/account?payouts=connected`,
		});

		res.send({ url: accountLink.url });
	},
);

// GET /api/payments/connect/status
router.get(
	'/api/payments/connect/status',
	requireAuth,
	async (req: Request, res: Response) => {
		const userId = req.currentUser!.id;

		const account = await ConnectedAccount.findOne({ userId });
		if (!account) {
			return res.send({
				connected: false,
				payoutsEnabled: false,
				detailsSubmitted: false,
			});
		}

		// By default return the CACHED flags — a Mongo read, instant. The hosted
		// onboarding state only changes when the seller finishes the Stripe flow,
		// so we hit Stripe only when explicitly asked (?refresh=1, used by the
		// account page when the seller lands back from onboarding). This keeps the
		// payout nudge on selling pages from waiting on a Stripe round-trip.
		if (req.query.refresh) {
			const stripeAccount = await stripe.accounts.retrieve(
				account.stripeAccountId,
			);
			account.set({
				payoutsEnabled: !!stripeAccount.payouts_enabled,
				detailsSubmitted: !!stripeAccount.details_submitted,
			});
			await account.save();
		}

		res.send({
			connected: true,
			payoutsEnabled: account.payoutsEnabled,
			detailsSubmitted: account.detailsSubmitted,
		});
	},
);

export { router as connectRouter };
