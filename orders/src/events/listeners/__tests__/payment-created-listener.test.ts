import { PaymentCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { PaymentCreatedListener } from '../payment-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { oid, fakeMsg, buildTicket } from '../../../test/factories';

const setup = async () => {
	const listener = new PaymentCreatedListener(natsWrapper.connection);

	const ticket = await buildTicket({ price: 20 });

	const order = Order.build({
		status: OrderStatus.Created,
		userId: 'abc',
		expiresAt: new Date(),
		ticket,
	});
	await order.save();

	const data: PaymentCreatedEvent['data'] = {
		id: oid(),
		orderId: order.id,
		stripeId: 'stripe123',
	};

	const msg = fakeMsg(1);

	return { listener, order, data, msg };
};

it('marks the order as complete', async () => {
	const { listener, order, data, msg } = await setup();

	await listener.onMessage(data, msg);

	const updatedOrder = await Order.findById(order.id);
	expect(updatedOrder!.status).toEqual(OrderStatus.Complete);
});

it('stamps the receipt metadata (stripeId + paidAt) on completion', async () => {
	const { listener, order, data, msg } = await setup();

	await listener.onMessage(data, msg);

	const updatedOrder = await Order.findById(order.id);
	expect(updatedOrder!.stripeId).toEqual(data.stripeId);
	expect(updatedOrder!.paidAt).toBeInstanceOf(Date);
});

it('acks the message', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	expect(msg.ack).toHaveBeenCalled();
});

it('skips a redelivered (duplicate) event, completing the order once', async () => {
	const { listener, order, data, msg } = await setup();

	await listener.onMessage(data, msg);
	await listener.onMessage(data, msg);

	const updatedOrder = await Order.findById(order.id);
	expect(updatedOrder!.status).toEqual(OrderStatus.Complete);
	// Saved (version bumped) only on the first delivery.
	expect(updatedOrder!.version).toEqual(order.version + 1);
	expect(msg.ack).toHaveBeenCalledTimes(2);
});

it('does not complete an order that was already cancelled', async () => {
	const { listener, order, data, msg } = await setup();

	// The order expired (or was cancelled) before the payment landed.
	order.set({ status: OrderStatus.Cancelled });
	await order.save();

	await listener.onMessage(data, msg);

	const updatedOrder = await Order.findById(order.id);
	expect(updatedOrder!.status).toEqual(OrderStatus.Cancelled);
	expect(msg.ack).toHaveBeenCalled();
});
