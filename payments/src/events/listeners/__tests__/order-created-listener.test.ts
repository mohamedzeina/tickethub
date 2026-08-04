import { natsWrapper } from '../../../nats-wrapper';
import { OrderCreatedListener } from '../order-created-listener';
import { OrderCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { Order } from '../../../models/order';
import { oid, msg } from '../../../test/helpers';

const setup = async () => {
	const listener = new OrderCreatedListener(natsWrapper.connection);

	const data: OrderCreatedEvent['data'] = {
		id: oid(),
		version: 0,
		expiresAt: 'swfasf',
		userId: 'asfafssf',
		userEmail: 'buyer@test.com',
		status: OrderStatus.Created,
		ticket: {
			id: 'asfmakf',
			price: 20,
			title: 'Test Show',
		},
	};

	return { listener, data, msg: msg(1) };
};

it('replicates the order info', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	const order = await Order.findById(data.id);

	expect(order!.price).toEqual(data.ticket.price);
});

it('acks the message', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	expect(msg.ack).toHaveBeenCalled();
});

it('replicates the order only once for a redelivered (duplicate) event', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);
	// A naive second create would throw a duplicate-key error; dedup skips it.
	await listener.onMessage(data, msg);

	const orders = await Order.find({ _id: data.id });
	expect(orders.length).toEqual(1);
	expect(msg.ack).toHaveBeenCalledTimes(2);
});
