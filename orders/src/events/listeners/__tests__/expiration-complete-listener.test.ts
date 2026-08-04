import { JSONCodec } from 'nats';
import { ExpirationCompleteEvent, OrderStatus } from '@zeina-tickethub/common';
import { ExpirationCompleteListener } from '../expiration-complete-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { fakeMsg, buildTicket } from '../../../test/factories';

const setup = async () => {
	const listener = new ExpirationCompleteListener(natsWrapper.connection);

	const ticket = await buildTicket({ price: 20 });

	const order = Order.build({
		status: OrderStatus.Created,
		userId: 'sqfqf',
		expiresAt: new Date(),
		ticket,
	});

	await order.save();

	const data: ExpirationCompleteEvent['data'] = {
		orderId: order.id,
	};

	const msg = fakeMsg(1);

	return { listener, order, ticket, data, msg };
};

it('updates the order status to canceled', async () => {
	const { listener, order, data, msg } = await setup();

	await listener.onMessage(data, msg);

	const updatedOrder = await Order.findById(order.id);

	expect(updatedOrder!.status).toEqual(OrderStatus.Cancelled);
});

it('emits an OrderCancelled event', async () => {
	const { listener, order, data, msg } = await setup();

	await listener.onMessage(data, msg);

	expect(natsWrapper.js.publish).toHaveBeenCalled();

	const eventData = (JSONCodec().decode((natsWrapper.js.publish as jest.Mock).mock.calls[0][1]) as any);

	expect(eventData.id).toEqual(order.id);
});

it('acks the message', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	expect(msg.ack).toHaveBeenCalled();
});

it('skips a redelivered (duplicate) event, cancelling and publishing once', async () => {
	const { listener, order, data, msg } = await setup();

	await listener.onMessage(data, msg);
	await listener.onMessage(data, msg);

	// The OrderCancelled event is published a single time.
	expect(natsWrapper.js.publish).toHaveBeenCalledTimes(1);

	// And the order ends up cancelled exactly once (version bumped only once).
	const updatedOrder = await Order.findById(order.id);
	expect(updatedOrder!.status).toEqual(OrderStatus.Cancelled);
	expect(updatedOrder!.version).toEqual(order.version + 1);

	// Both deliveries are acked.
	expect(msg.ack).toHaveBeenCalledTimes(2);
});
