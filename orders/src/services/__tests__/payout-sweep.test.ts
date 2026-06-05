import mongoose from 'mongoose';
import { JSONCodec } from 'nats';
import { OrderStatus } from '@zeina-tickethub/common';
import { runPayoutSweep } from '../payout-sweep';
import { Order } from '../../models/order';
import { Ticket } from '../../models/ticket';
import { natsWrapper } from '../../nats-wrapper';

const oid = () => new mongoose.Types.ObjectId().toHexString();

// Build a Complete, paid order owned by `sellerId` (the ticket owner). eventDate
// is far in the future so the refund window is governed by REFUND_WINDOW_HOURS.
const completedOrder = async (sellerId: string, price = 100) => {
	const ticket = Ticket.build({
		id: oid(),
		title: 'Seat',
		price,
		userId: sellerId,
		eventDate: new Date(Date.now() + 1000 * 3600 * 24 * 30).toISOString(),
	});
	await ticket.save();

	const order = Order.build({
		userId: oid(), // buyer
		status: OrderStatus.Complete,
		expiresAt: new Date(),
		ticket,
	});
	order.set({ paidAt: new Date(Date.now() - 1000) });
	await order.save();
	return order;
};

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

	it('skips orders that are not Complete', async () => {
		process.env.REFUND_WINDOW_HOURS = '0';
		const ticket = Ticket.build({
			id: oid(),
			title: 'Seat',
			price: 50,
			userId: oid(),
		});
		await ticket.save();
		const order = Order.build({
			userId: oid(),
			status: OrderStatus.AwaitingPayment,
			expiresAt: new Date(),
			ticket,
		});
		order.set({ paidAt: new Date(Date.now() - 1000) });
		await order.save();

		const emitted = await runPayoutSweep();
		expect(emitted).toBe(0);
	});
});
