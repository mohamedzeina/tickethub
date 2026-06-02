import { OrderCancelledEvent, OrderStatus } from '@zeina-tickethub/common';
import { OrderCancelledListener } from '../order-cancelled-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import mongoose from 'mongoose';

const setup = async () => {
	const listener = new OrderCancelledListener(natsWrapper.client);

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
		ticket: {
			id: 'asafalkfn',
		},
	};

	// @ts-ignore
	const msg: Message = {
		ack: jest.fn(),
		getSequence: () => 1,
	};

	return { listener, data, msg, order };
};

it('updates the status of the order', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	const updatedOrder = await Order.findById(data.id);

	expect(updatedOrder!.status).toEqual(OrderStatus.Cancelled);
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

	const updatedOrder = await Order.findById(data.id);
	expect(updatedOrder!.status).toEqual(OrderStatus.Cancelled);
	// Version bumped only on the first delivery.
	expect(updatedOrder!.version).toEqual(order.version + 1);
	expect(msg.ack).toHaveBeenCalledTimes(2);
});
