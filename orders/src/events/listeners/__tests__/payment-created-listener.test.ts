import mongoose from 'mongoose';
import { Message } from 'node-nats-streaming';
import { PaymentCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { PaymentCreatedListener } from '../payment-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Ticket } from '../../../models/ticket';
import { Order } from '../../../models/order';

const setup = async () => {
	const listener = new PaymentCreatedListener(natsWrapper.client);

	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 20,
	});
	await ticket.save();

	const order = Order.build({
		status: OrderStatus.Created,
		userId: 'abc',
		expiresAt: new Date(),
		ticket,
	});
	await order.save();

	const data: PaymentCreatedEvent['data'] = {
		id: new mongoose.Types.ObjectId().toHexString(),
		orderId: order.id,
		stripeId: 'stripe123',
	};

	// @ts-ignore
	const msg: Message = {
		ack: jest.fn(),
		getSequence: () => 1,
	};

	return { listener, order, data, msg };
};

it('marks the order as complete', async () => {
	const { listener, order, data, msg } = await setup();

	await listener.onMessage(data, msg);

	const updatedOrder = await Order.findById(order.id);
	expect(updatedOrder!.status).toEqual(OrderStatus.Complete);
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
