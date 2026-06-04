import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { PaymentCreatedEvent, OrderStatus } from '@zeina-tickethub/common';
import { PaymentCreatedListener } from '../payment-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { OrderRef } from '../../../models/order-ref';

const id = () => new mongoose.Types.ObjectId().toHexString();

const seedOrder = async (status = OrderStatus.Created) => {
	const order = OrderRef.build({
		id: id(),
		buyerId: id(),
		sellerId: id(),
		ticketId: id(),
		ticketTitle: 'Coldplay',
		status,
	});
	await order.save();
	return order;
};

it('marks the order complete so it becomes reviewable', async () => {
	const order = await seedOrder();
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const data: PaymentCreatedEvent['data'] = {
		id: id(),
		orderId: order.id,
		stripeId: 'pi_123',
	};
	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };

	await listener.onMessage(data, msg);

	const updated = await OrderRef.findById(order.id);
	expect(updated!.status).toEqual(OrderStatus.Complete);
	expect(msg.ack).toHaveBeenCalled();
});

it('throws for retry when the order replica is not present yet', async () => {
	const listener = new PaymentCreatedListener(natsWrapper.connection);
	const data: PaymentCreatedEvent['data'] = {
		id: id(),
		orderId: id(),
		stripeId: 'pi_123',
	};
	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };

	await expect(listener.onMessage(data, msg)).rejects.toThrow('OrderRef not found');
	expect(msg.ack).not.toHaveBeenCalled();
});
