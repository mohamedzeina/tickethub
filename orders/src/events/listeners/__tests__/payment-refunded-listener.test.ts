import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { OrderStatus, PaymentRefundedEvent } from '@zeina-tickethub/common';
import { PaymentRefundedListener } from '../payment-refunded-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Ticket } from '../../../models/ticket';
import { Order } from '../../../models/order';

const buildOrder = async (status = OrderStatus.Complete) => {
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 50,
	});
	await ticket.save();
	const order = Order.build({
		userId: new mongoose.Types.ObjectId().toHexString(),
		status,
		expiresAt: new Date(),
		ticket,
	});
	order.set({ paidAt: new Date() });
	await order.save();
	return order;
};

const msg = (seq: number) => ({ ack: jest.fn(), seq }) as unknown as JsMsg;

it('flips the order to Refunded with metadata and releases the ticket', async () => {
	const order = await buildOrder();
	const listener = new PaymentRefundedListener(natsWrapper.connection);
	const data: PaymentRefundedEvent['data'] = {
		id: 'pay_1',
		orderId: order.id,
		stripeId: 'pi_1',
		amount: 50,
		refundId: 're_1',
	};
	const m = msg(1);

	await listener.onMessage(data, m);

	const updated = await Order.findById(order.id);
	expect(updated!.status).toEqual(OrderStatus.Refunded);
	expect(updated!.refundedAt).toBeTruthy();
	expect(updated!.refundAmount).toEqual(50);
	expect(updated!.stripeRefundId).toEqual('re_1');
	// order:cancelled published to release the ticket + cascade.
	expect(natsWrapper.js.publish).toHaveBeenCalled();
	expect(m.ack).toHaveBeenCalled();
});

it('is a no-op when the order is already Refunded', async () => {
	const order = await buildOrder(OrderStatus.Refunded);
	const listener = new PaymentRefundedListener(natsWrapper.connection);
	await listener.onMessage(
		{ id: 'p', orderId: order.id, stripeId: 'pi_1' } as any,
		msg(1),
	);
	expect(natsWrapper.js.publish).not.toHaveBeenCalled();
});

it('throws (for retry) when the order replica is missing', async () => {
	const listener = new PaymentRefundedListener(natsWrapper.connection);
	const m = msg(1);
	await expect(
		listener.onMessage(
			{ id: 'p', orderId: new mongoose.Types.ObjectId().toHexString(), stripeId: 'pi_1' } as any,
			m,
		),
	).rejects.toThrow('Order not found');
	expect(m.ack).not.toHaveBeenCalled();
});
