import { PaymentInitiatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { PaymentInitiatedListener } from '../payment-initiated-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { fakeMsg, buildTicket } from '../../../test/factories';

const setup = async (status: OrderStatus = OrderStatus.Created) => {
	const listener = new PaymentInitiatedListener(natsWrapper.connection);

	const ticket = await buildTicket({ price: 20 });

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

	const msg = fakeMsg(1);

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
