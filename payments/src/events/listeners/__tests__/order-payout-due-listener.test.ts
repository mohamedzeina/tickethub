import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { OrderPayoutDueEvent } from '@zeina-tickethub/common';

// Mock Stripe so the transfer is deterministic and needs no network / key.
jest.mock('../../../stripe', () => ({
	stripe: {
		transfers: { create: jest.fn() },
	},
	CURRENCY: 'eur',
}));

import { OrderPayoutDueListener } from '../order-payout-due-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Payment } from '../../../models/payment';
import { Payout } from '../../../models/payout';
import { ConnectedAccount } from '../../../models/connected-account';
import { stripe } from '../../../stripe';

const transfersCreate = stripe.transfers.create as jest.Mock;
const oid = () => new mongoose.Types.ObjectId().toHexString();
const msg = (seq: number) => ({ ack: jest.fn(), seq }) as unknown as JsMsg;

beforeEach(() => transfersCreate.mockReset());

const deliver = (data: OrderPayoutDueEvent['data'], seq = 1) =>
	new OrderPayoutDueListener(natsWrapper.connection).onMessage(data, msg(seq));

it('holds the payout (pending_account) when the seller has not connected', async () => {
	const orderId = oid();
	const sellerId = oid();

	await deliver({ orderId, sellerId, amount: 100 });

	const payout = await Payout.findOne({ orderId });
	expect(payout).not.toBeNull();
	expect(payout!.status).toBe('pending_account');
	expect(payout!.fee).toBe(10); // 10% of 100
	expect(transfersCreate).not.toHaveBeenCalled();
});

it('transfers (amount − 10% fee) via source_transaction and marks paid when enabled', async () => {
	const orderId = oid();
	const sellerId = oid();
	await ConnectedAccount.build({
		userId: sellerId,
		stripeAccountId: 'acct_seller',
		payoutsEnabled: true,
		detailsSubmitted: true,
	}).save();
	await Payment.build({ orderId, stripeId: 'pi_1', chargeId: 'ch_1' }).save();
	transfersCreate.mockResolvedValue({ id: 'tr_1' });

	await deliver({ orderId, sellerId, amount: 100 });

	expect(transfersCreate).toHaveBeenCalledTimes(1);
	expect(transfersCreate).toHaveBeenCalledWith(
		expect.objectContaining({
			amount: 9000, // (100 − 10) * 100
			currency: 'eur',
			destination: 'acct_seller',
			source_transaction: 'ch_1',
		}),
		{ idempotencyKey: `payout_${orderId}_eur` },
	);

	const payout = await Payout.findOne({ orderId });
	expect(payout!.status).toBe('paid');
	expect(payout!.transferId).toBe('tr_1');
	expect(payout!.stripeAccountId).toBe('acct_seller');
});

it('is idempotent — a redelivery does not create a second payout or transfer', async () => {
	const orderId = oid();
	const sellerId = oid();
	await ConnectedAccount.build({
		userId: sellerId,
		stripeAccountId: 'acct_seller',
		payoutsEnabled: true,
	}).save();
	transfersCreate.mockResolvedValue({ id: 'tr_1' });

	await deliver({ orderId, sellerId, amount: 100 }, 1);
	await deliver({ orderId, sellerId, amount: 100 }, 2); // redelivery, new seq

	expect(transfersCreate).toHaveBeenCalledTimes(1);
	expect(await Payout.countDocuments({ orderId })).toBe(1);
});
