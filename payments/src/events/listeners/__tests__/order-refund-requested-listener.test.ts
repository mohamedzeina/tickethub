import { OrderRefundRequestedEvent } from '@zeina-tickethub/common';
import { oid, msg } from '../../../test/helpers';

// Mock the Stripe client so the unit test is deterministic and needs no network
// / API key — we only assert that we *ask* Stripe to refund and record it pending.
jest.mock('../../../stripe', () => ({
	stripe: {
		refunds: {
			create: jest.fn().mockResolvedValue({ id: 're_test_123', amount: 2000 }),
		},
	},
}));

import { OrderRefundRequestedListener } from '../order-refund-requested-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Payment } from '../../../models/payment';
import { Refund } from '../../../models/refund';
import { stripe } from '../../../stripe';

it('refunds the charge, records it PENDING, and does NOT publish yet', async () => {
	const orderId = oid();
	await Payment.build({ orderId, stripeId: 'pi_abc' }).save();

	const listener = new OrderRefundRequestedListener(natsWrapper.connection);
	const data: OrderRefundRequestedEvent['data'] = { id: orderId };
	const m = msg(1);

	await listener.onMessage(data, m);

	expect(stripe.refunds.create).toHaveBeenCalledWith(
		{ payment_intent: 'pi_abc' },
		{ idempotencyKey: `refund_${orderId}` },
	);

	const refund = await Refund.findOne({ orderId });
	expect(refund).not.toBeNull();
	expect(refund!.status).toBe('pending');
	expect(refund!.refundId).toBe('re_test_123');
	expect(refund!.amount).toBe(20);

	// Confirmation (payment:refunded) waits for the Stripe webhook — not here.
	expect(natsWrapper.js.publish).not.toHaveBeenCalled();
	expect(m.ack).toHaveBeenCalled();
});

it('is a no-op when the order was never paid (no Payment record)', async () => {
	const listener = new OrderRefundRequestedListener(natsWrapper.connection);
	const m = msg(1);

	await listener.onMessage({ id: oid() }, m);

	expect(stripe.refunds.create).not.toHaveBeenCalled();
	expect(m.ack).toHaveBeenCalled();
});

it('does not create a second refund when one already exists', async () => {
	const orderId = oid();
	await Payment.build({ orderId, stripeId: 'pi_abc' }).save();
	await Refund.build({ orderId, stripeId: 'pi_abc', status: 'pending' }).save();

	const listener = new OrderRefundRequestedListener(natsWrapper.connection);
	await listener.onMessage({ id: orderId }, msg(1));

	expect(stripe.refunds.create).not.toHaveBeenCalled();
});
