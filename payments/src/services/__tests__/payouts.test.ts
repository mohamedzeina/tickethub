import mongoose from 'mongoose';

jest.mock('../../stripe', () => ({
	stripe: { transfers: { create: jest.fn() } },
}));

import { computeFeeCents, releaseHeldPayouts } from '../payouts';
import { Payout } from '../../models/payout';
import { ConnectedAccount } from '../../models/connected-account';
import { stripe } from '../../stripe';

const transfersCreate = stripe.transfers.create as jest.Mock;
const oid = () => new mongoose.Types.ObjectId().toHexString();

beforeEach(() => transfersCreate.mockReset());

describe('computeFeeCents (default 10%)', () => {
	it('takes 10% and floors to whole cents (never over-pays the seller)', () => {
		expect(computeFeeCents(10000)).toBe(1000); // $100 → $10
		expect(computeFeeCents(999)).toBe(99); // floor(99.9) → 99c, seller gets 900c
		expect(computeFeeCents(0)).toBe(0);
	});
});

describe('releaseHeldPayouts', () => {
	it('transfers every held payout once the seller is enabled and marks them paid', async () => {
		const sellerId = oid();
		await ConnectedAccount.build({
			userId: sellerId,
			stripeAccountId: 'acct_seller',
			payoutsEnabled: true,
		}).save();
		await Payout.build({
			orderId: oid(),
			sellerId,
			amount: 50,
			fee: 5,
			chargeId: 'ch_a',
			status: 'pending_account',
		}).save();
		await Payout.build({
			orderId: oid(),
			sellerId,
			amount: 80,
			fee: 8,
			chargeId: 'ch_b',
			status: 'pending_account',
		}).save();
		transfersCreate.mockResolvedValue({ id: 'tr_x' });

		const released = await releaseHeldPayouts(sellerId);

		expect(released).toBe(2);
		expect(transfersCreate).toHaveBeenCalledTimes(2);
		const remaining = await Payout.countDocuments({
			sellerId,
			status: 'pending_account',
		});
		expect(remaining).toBe(0);
	});

	it('marks a payout FAILED (not crash) when the transfer errors, then pays it on retry', async () => {
		const sellerId = oid();
		await ConnectedAccount.build({
			userId: sellerId,
			stripeAccountId: 'acct_seller',
			payoutsEnabled: true,
		}).save();
		await Payout.build({
			orderId: oid(),
			sellerId,
			amount: 50,
			fee: 5,
			chargeId: 'ch_a',
			status: 'pending_account',
		}).save();

		// First attempt: Stripe throws → must not bubble; payout becomes 'failed'.
		transfersCreate.mockRejectedValueOnce(new Error('insufficient funds'));
		const first = await releaseHeldPayouts(sellerId);
		expect(first).toBe(0);
		expect((await Payout.findOne({ sellerId }))!.status).toBe('failed');

		// Retry (e.g. seller revisits) succeeds → release also retries 'failed'.
		transfersCreate.mockResolvedValueOnce({ id: 'tr_retry' });
		const second = await releaseHeldPayouts(sellerId);
		expect(second).toBe(1);
		const paid = await Payout.findOne({ sellerId });
		expect(paid!.status).toBe('paid');
		expect(paid!.transferId).toBe('tr_retry');
	});

	it('does nothing while the seller is still not enabled', async () => {
		const sellerId = oid();
		await ConnectedAccount.build({
			userId: sellerId,
			stripeAccountId: 'acct_seller',
			payoutsEnabled: false,
		}).save();
		await Payout.build({
			orderId: oid(),
			sellerId,
			amount: 50,
			fee: 5,
			status: 'pending_account',
		}).save();

		const released = await releaseHeldPayouts(sellerId);

		expect(released).toBe(0);
		expect(transfersCreate).not.toHaveBeenCalled();
	});
});
