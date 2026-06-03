import mongoose from 'mongoose';
import { JsMsg } from 'nats';

// Mock just sendMail; keep the rest of common real (events, OrderStatus, …).
jest.mock('@zeina-tickethub/common', () => ({
	...jest.requireActual('@zeina-tickethub/common'),
	sendMail: jest.fn(),
}));

import {
	ExpirationWarningEvent,
	OrderStatus,
	sendMail,
} from '@zeina-tickethub/common';
import { ExpirationWarningListener } from '../expiration-warning-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Ticket } from '../../../models/ticket';
import { Order } from '../../../models/order';

const setup = async (status: OrderStatus) => {
	const listener = new ExpirationWarningListener(natsWrapper.connection);

	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 20,
	});
	await ticket.save();

	const order = Order.build({
		status,
		userId: 'abc',
		userEmail: 'buyer@test.com',
		expiresAt: new Date(),
		ticket,
	});
	await order.save();

	const data: ExpirationWarningEvent['data'] = { orderId: order.id };

	// @ts-ignore
	const msg: JsMsg = { ack: jest.fn(), seq: 1 };

	return { listener, order, data, msg };
};

beforeEach(() => (sendMail as jest.Mock).mockClear());

it('emails a warning when the order is still unpaid', async () => {
	const { listener, data, msg } = await setup(OrderStatus.Created);

	await listener.onMessage(data, msg);

	expect(sendMail).toHaveBeenCalledTimes(1);
	expect((sendMail as jest.Mock).mock.calls[0][0].to).toEqual('buyer@test.com');
	expect(msg.ack).toHaveBeenCalled();
});

it('also warns when the order is awaiting payment', async () => {
	const { listener, data, msg } = await setup(OrderStatus.AwaitingPayment);

	await listener.onMessage(data, msg);

	expect(sendMail).toHaveBeenCalledTimes(1);
});

it('stays silent when the order is already paid', async () => {
	const { listener, data, msg } = await setup(OrderStatus.Complete);

	await listener.onMessage(data, msg);

	expect(sendMail).not.toHaveBeenCalled();
	expect(msg.ack).toHaveBeenCalled();
});

it('stays silent when the order was cancelled', async () => {
	const { listener, data, msg } = await setup(OrderStatus.Cancelled);

	await listener.onMessage(data, msg);

	expect(sendMail).not.toHaveBeenCalled();
});
