import { OrderCancelledEvent, OrderStatus } from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { OrderCancelledListener } from '../order-cancelled-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { Payment } from '../../../models/payment';
import mongoose from 'mongoose';

const setup = async () => {
	const listener = new OrderCancelledListener(natsWrapper.connection);

	const order = await Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		version: 0,
		userId: 'asfafssf',
		status: OrderStatus.Created,
		price: 20,
	});
	await order.save();

	const data: OrderCancelledEvent['data'] = {
		id: order.id,
		version: 1,
		ticket: { id: 'asafalkfn' },
	};

	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };

	return { listener, data, msg, order };
};

it('updates the status of the order to cancelled', async () => {
	const { listener, data, msg } = await setup();
	await listener.onMessage(data, msg);
	const updated = await Order.findById(data.id);
	expect(updated!.status).toEqual(OrderStatus.Cancelled);
});

it('acks the message', async () => {
	const { listener, data, msg } = await setup();
	await listener.onMessage(data, msg);
	expect(msg.ack).toHaveBeenCalled();
});

it('cancels the order only once for a redelivered (duplicate) event', async () => {
	const { listener, data, msg, order } = await setup();
	await listener.onMessage(data, msg);
	await listener.onMessage(data, msg);
	const updated = await Order.findById(data.id);
	expect(updated!.status).toEqual(OrderStatus.Cancelled);
	// Version bumped only on the first delivery.
	expect(updated!.version).toEqual(order.version + 1);
	expect(msg.ack).toHaveBeenCalledTimes(2);
});

it('never refunds or publishes — refunds run via the refund flow, not cancel', async () => {
	const { listener, data, msg } = await setup();
	// Even for a PAID order, cancel no longer triggers a refund (that path is now
	// order:refund:requested → Stripe webhook → payment:refunded).
	await Payment.build({ orderId: data.id, stripeId: 'pi_paid' }).save();

	await listener.onMessage(data, msg);

	expect(natsWrapper.js.publish).not.toHaveBeenCalled();
});
