import { JSONCodec } from 'nats';
import { OrderStatus } from '@zeina-tickethub/common';
import { runPayoutSweep } from '../payout-sweep';
import { Order } from '../../models/order';
import { natsWrapper } from '../../nats-wrapper';
import { oid, buildTicket, buildPaidOrder } from '../../test/factories';

// Build a Complete, paid order owned by `sellerId` (the ticket owner). eventDate
// is far in the future so the refund window is governed by REFUND_WINDOW_HOURS.
const completedOrder = async (sellerId: string, price = 100) =>
	buildPaidOrder({
		ticket: await buildTicket({
			title: 'Seat',
			price,
			userId: sellerId,
			eventDate: new Date(Date.now() + 1000 * 3600 * 24 * 30).toISOString(),
		}),
		paidAt: new Date(Date.now() - 1000),
	});

describe('payout sweep', () => {
	it('emits order:payout:due once for an order past its refund window and marks it', async () => {
		process.env.REFUND_WINDOW_HOURS = '0'; // window closed immediately after paid
		const sellerId = oid();
		const order = await completedOrder(sellerId, 100);

		const emitted = await runPayoutSweep();
		expect(emitted).toBe(1);

		expect(natsWrapper.js.publish).toHaveBeenCalledTimes(1);
		const [subject, payload] = (natsWrapper.js.publish as jest.Mock).mock
			.calls[0];
		expect(subject).toBe('order:payout:due');
		const data = JSONCodec().decode(payload) as any;
		expect(data).toMatchObject({
			orderId: order.id,
			sellerId,
			amount: 100,
		});

		const updated = await Order.findById(order.id);
		expect(updated!.payoutDueAt).toBeTruthy();

		// A second sweep does nothing (already marked).
		const again = await runPayoutSweep();
		expect(again).toBe(0);
		expect(natsWrapper.js.publish).toHaveBeenCalledTimes(1);
	});

	it('does NOT emit while the refund window is still open', async () => {
		process.env.REFUND_WINDOW_HOURS = '24'; // paid just now → window open 24h
		await completedOrder(oid(), 100);

		const emitted = await runPayoutSweep();
		expect(emitted).toBe(0);
		expect(natsWrapper.js.publish).not.toHaveBeenCalled();
	});

	it('skips an order that has already been refunded', async () => {
		process.env.REFUND_WINDOW_HOURS = '0';
		// A settled refund (refundedAt stamped) must never be paid out. The sweep's
		// filter used to omit refundedAt — only the Complete status kept this from
		// becoming a real double-payment.
		await buildPaidOrder({
			ticket: await buildTicket({ title: 'Seat', price: 50, userId: oid() }),
			paidAt: new Date(Date.now() - 1000),
			refundedAt: new Date(),
			refundAmount: 50,
		});

		const emitted = await runPayoutSweep();
		expect(emitted).toBe(0);
		expect(natsWrapper.js.publish).not.toHaveBeenCalled();
	});

	it('skips orders that are not Complete', async () => {
		process.env.REFUND_WINDOW_HOURS = '0';
		await buildPaidOrder({
			ticket: await buildTicket({ title: 'Seat', price: 50, userId: oid() }),
			status: OrderStatus.AwaitingPayment,
			paidAt: new Date(Date.now() - 1000),
		});

		const emitted = await runPayoutSweep();
		expect(emitted).toBe(0);
	});
});
