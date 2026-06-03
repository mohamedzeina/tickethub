import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { PaymentInitiatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { PaymentInitiatedListener } from '../payment-initiated-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Ticket } from '../../../models/ticket';
import { Order } from '../../../models/order';

const setup = async (status: OrderStatus = OrderStatus.Created) => {
	const listener = new PaymentInitiatedListener(natsWrapper.connection);

	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 20,
	});
	await ticket.save();

	const order = Order.build({
		status,
		userId: 'abc',
		expiresAt: new Date(),
		ticket,
	});
	await order.save();

	const data: PaymentInitiatedEvent['data'] = {
		orderId: order.id,
	};

	// @ts-ignore
	const msg: JsMsg = {
		ack: jest.fn(),
		seq: 1,
	};

	return { listener, order, data, msg };
};

it('moves a created order to awaiting payment', async () => {
	const { listener, order, data, msg } = await setup();

	await listener.onMessage(data, msg);

	const updatedOrder = await Order.findById(order.id);
	expect(updatedOrder!.status).toEqual(OrderStatus.AwaitingPayment);
});

it('acks the message', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	expect(msg.ack).toHaveBeenCalled();
});

it('never walks a completed order backwards', async () => {
	const { listener, order, data, msg } = await setup(OrderStatus.Complete);

	await listener.onMessage(data, msg);

	const updatedOrder = await Order.findById(order.id);
	expect(updatedOrder!.status).toEqual(OrderStatus.Complete);
});

it('transitions once for a redelivered (duplicate) event', async () => {
	const { listener, order, data, msg } = await setup();

	await listener.onMessage(data, msg);
	await listener.onMessage(data, msg);

	const updatedOrder = await Order.findById(order.id);
	expect(updatedOrder!.status).toEqual(OrderStatus.AwaitingPayment);
	expect(updatedOrder!.version).toEqual(order.version + 1);
	expect(msg.ack).toHaveBeenCalledTimes(2);
});
