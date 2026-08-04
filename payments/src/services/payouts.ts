import { logger } from '@zeina-tickethub/common';
import { stripe, CURRENCY } from '../stripe';
import { Payout, PayoutDoc } from '../models/payout';
import { ConnectedAccount } from '../models/connected-account';
import { Payment } from '../models/payment';
import { PayoutProcessedPublisher } from '../events/publishers/payout-processed-publisher';
import { natsWrapper } from '../nats-wrapper';

// What the seller actually receives: the sale minus the platform fee, rounded
// to cents. The single definition — the earnings route reports the same number.
export const netOf = (payout: { amount: number; fee: number }): number =>
	Math.round((payout.amount - payout.fee) * 100) / 100;

// Tell notifications a seller's payout reached a terminal state (paid / held).
export const announcePayout = (payout: PayoutDoc, status: 'paid' | 'held') =>
	new PayoutProcessedPublisher(natsWrapper.js).publish({
		orderId: payout.orderId,
		sellerId: payout.sellerId,
		net: netOf(payout),
		status,
	});

// Platform fee in basis points (1000 = 10%). The "fee" is simply the slice we
// DON'T transfer — with separate charge + transfer there's no application_fee.
export const feeBps = (): number => Number(process.env.PLATFORM_FEE_BPS ?? 1000);

// Integer-cents fee so rounding is exact and never over-pays the seller.
export const computeFeeCents = (amountCents: number): number =>
	Math.floor((amountCents * feeBps()) / 10000);

// Try to pay out a held/new payout. If the seller's connected account is ready,
// create the Stripe transfer (seller share = amount − fee) and mark it paid;
// otherwise leave it pending_account (held on the platform) for later release.
// Idempotent: the transfer uses idempotencyKey payout_<orderId>, and we only
// transfer when status !== 'paid'.
export const attemptTransfer = async (payout: PayoutDoc): Promise<PayoutDoc> => {
	if (payout.status === 'paid') return payout;

	const account = await ConnectedAccount.findOne({ userId: payout.sellerId });
	if (!account || !account.payoutsEnabled) {
		return payout; // seller not connected yet — keep holding
	}

	// Backfill the charge id if the Payment record landed after this payout was
	// created (order:payout:due racing payment_intent.succeeded), so the transfer
	// can still draw from the originating charge.
	if (!payout.chargeId) {
		const payment = await Payment.findOne({ orderId: payout.orderId });
		if (payment?.chargeId) payout.set({ chargeId: payment.chargeId });
	}

	const amountCents = Math.round(payout.amount * 100);
	const feeCents = Math.round(payout.fee * 100);
	const transferCents = amountCents - feeCents;

	// Inferred against transfers.create() rather than annotated: stripe v22 stopped
	// re-exporting its param types from the package entry point (they live in an
	// unexported namespace), so Stripe.TransferCreateParams no longer resolves.
	const params = {
		amount: transferCents,
		currency: CURRENCY,
		destination: account.stripeAccountId,
		metadata: { orderId: payout.orderId },
		// Tie the transfer to the originating charge so it draws from that charge's
		// funds (and doesn't fail on a not-yet-available platform balance).
		...(payout.chargeId ? { source_transaction: payout.chargeId } : {}),
	};

	try {
		const transfer = await stripe.transfers.create(params, {
			// Currency-scoped so a one-per-order transfer is still idempotent against
			// redelivery, but a currency change (e.g. a USD→EUR migration) gets a
			// fresh key instead of colliding with the old locked params.
			idempotencyKey: `payout_${payout.orderId}_${CURRENCY}`,
		});
		payout.set({
			status: 'paid',
			transferId: transfer.id,
			stripeAccountId: account.stripeAccountId,
		});
		await payout.save();
		await announcePayout(payout, 'paid'); // → seller "€X paid out"
	} catch (err) {
		// NEVER let a Stripe error crash the listener or 500 the status route, and
		// never leave the payout silently stuck on 'pending_account'. Mark it
		// 'failed' (visible) and log; releaseHeldPayouts retries 'failed' too, and
		// the idempotencyKey makes a retransfer safe (no double-pay).
		logger.error(
			{ orderId: payout.orderId, sellerId: payout.sellerId, err },
			'seller payout transfer failed',
		);
		payout.set({ status: 'failed', stripeAccountId: account.stripeAccountId });
		await payout.save();
	}
	return payout;
};

// Release every payout we're holding (or that failed a prior transfer) for a
// seller — called when their connected account becomes enabled (status refresh,
// or a future account.updated webhook). Retrying 'failed' here is the recovery
// path for a transient Stripe error; the transfer idempotencyKey makes it safe.
export const releaseHeldPayouts = async (sellerId: string): Promise<number> => {
	const held = await Payout.find({
		sellerId,
		status: { $in: ['pending_account', 'failed'] },
	});
	let released = 0;
	for (const payout of held) {
		await attemptTransfer(payout);
		if (payout.status === 'paid') released += 1;
	}
	return released;
};
