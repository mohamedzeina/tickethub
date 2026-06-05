import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { Ticket } from '../../models/ticket';
import { Order } from '../../models/order';
import { OrderStatus } from '@zeina-tickethub/common';
import { natsWrapper } from '../../nats-wrapper';

const DAY = 86400000;
const futureISO = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const buildOrder = async (
	userId: string,
	{
		status = OrderStatus.Complete,
		paidAt = new Date(),
		eventDate = futureISO(30),
		redeemedAt,
		refundRequestedAt,
	}: any = {},
) => {
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 50,
		eventDate,
	});
	await ticket.save();

	const order = Order.build({
		userId,
		status,
		expiresAt: new Date(),
		ticket,
	});
	order.set({ paidAt, redeemedAt, refundRequestedAt });
	await order.save();
	return order;
};

it('refunds a paid, in-window order: 200, marks requested, publishes order:refund:requested', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
	const order = await buildOrder(userId);

	const res = await request(app)
		.post(`/api/orders/${order.id}/refund`)
		.set('Cookie', global.signin(userId))
		.send()
		.expect(200);

	expect(res.body.refundRequestedAt).toBeTruthy();
	expect(natsWrapper.js.publish).toHaveBeenCalled();

	const updated = await Order.findById(order.id);
	expect(updated!.refundRequestedAt).toBeTruthy();
	// Status stays Complete until the webhook confirms the refund settled.
	expect(updated!.status).toEqual(OrderStatus.Complete);
});

it('404s for a non-existent order', async () => {
	await request(app)
		.post(`/api/orders/${new mongoose.Types.ObjectId().toHexString()}/refund`)
		.set('Cookie', global.signin())
		.send()
		.expect(404);
});

it("401s when the order isn't yours", async () => {
	const order = await buildOrder(new mongoose.Types.ObjectId().toHexString());
	await request(app)
		.post(`/api/orders/${order.id}/refund`)
		.set('Cookie', global.signin())
		.send()
		.expect(401);
});

it('400s when the order is not paid', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
	const order = await buildOrder(userId, { status: OrderStatus.Created, paidAt: undefined });
	await request(app)
		.post(`/api/orders/${order.id}/refund`)
		.set('Cookie', global.signin(userId))
		.send()
		.expect(400);
});

it('400s when the ticket has already been scanned in (redeemed)', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
	const order = await buildOrder(userId, { redeemedAt: new Date() });
	await request(app)
		.post(`/api/orders/${order.id}/refund`)
		.set('Cookie', global.signin(userId))
		.send()
		.expect(400);
});

it('400s when the refund window has passed', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
	// Paid 2 days ago → past the default 24h window.
	const order = await buildOrder(userId, { paidAt: new Date(Date.now() - 2 * DAY) });
	await request(app)
		.post(`/api/orders/${order.id}/refund`)
		.set('Cookie', global.signin(userId))
		.send()
		.expect(400);
});

it('400s when a refund was already requested', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();
	const order = await buildOrder(userId, { refundRequestedAt: new Date() });
	await request(app)
		.post(`/api/orders/${order.id}/refund`)
		.set('Cookie', global.signin(userId))
		.send()
		.expect(400);
});
