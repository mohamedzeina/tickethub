import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { OrderStatus, TicketRedeemedEvent } from '@zeina-tickethub/common';
import { TicketRedeemedListener } from '../ticket-redeemed-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Ticket } from '../../../models/ticket';
import { Order } from '../../../models/order';

const buildOrder = async () => {
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 50,
	});
	await ticket.save();
	const order = Order.build({
		userId: new mongoose.Types.ObjectId().toHexString(),
		status: OrderStatus.Complete,
		expiresAt: new Date(),
		ticket,
	});
	order.set({ paidAt: new Date() });
	await order.save();
	return order;
};

const msg = (seq: number) => ({ ack: jest.fn(), seq }) as unknown as JsMsg;

it('stamps redeemedAt so the order can no longer be refunded', async () => {
	const order = await buildOrder();
	const listener = new TicketRedeemedListener(natsWrapper.connection);
	const data: TicketRedeemedEvent['data'] = {
		passId: 'pass_1',
		orderId: order.id,
		ticketId: order.ticket.id,
		buyerId: order.userId,
		redeemedAt: new Date().toISOString(),
	};
	const m = msg(1);

	await listener.onMessage(data, m);

	const updated = await Order.findById(order.id);
	expect(updated!.redeemedAt).toBeTruthy();
	expect(m.ack).toHaveBeenCalled();
});

it('is a no-op for an unknown order', async () => {
	const listener = new TicketRedeemedListener(natsWrapper.connection);
	const m = msg(1);
	await listener.onMessage(
		{
			passId: 'p',
			orderId: new mongoose.Types.ObjectId().toHexString(),
			ticketId: 't',
			buyerId: 'b',
			redeemedAt: new Date().toISOString(),
		} as any,
		m,
	);
	expect(m.ack).toHaveBeenCalled();
});
