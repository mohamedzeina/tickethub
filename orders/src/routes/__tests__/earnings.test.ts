import request from 'supertest';
import mongoose from 'mongoose';
import { OrderStatus } from '@zeina-tickethub/common';
import { app } from '../../app';
import { Ticket } from '../../models/ticket';
import { Order } from '../../models/order';

const oid = () => new mongoose.Types.ObjectId().toHexString();

const buildTicket = async (sellerId: string, price: number, title = 'Seat') => {
	const ticket = Ticket.build({ id: oid(), title, price, userId: sellerId });
	await ticket.save();
	return ticket;
};

// A completed, paid order (a real sale) for the given ticket. `extra` overrides
// let a test mark it swept / refunded / refund-requested.
const paidOrder = async (ticket: any, extra: Record<string, unknown> = {}) => {
	const order = Order.build({
		userId: oid(), // buyer
		status: OrderStatus.Complete,
		expiresAt: new Date(),
		ticket,
	});
	order.set({ paidAt: new Date(), ...extra });
	await order.save();
	return order;
};

it('returns the seller’s in-window sales as clearing earnings, net of the fee', async () => {
	const sellerId = oid();
	const cookie = global.signin(sellerId);

	const t1 = await buildTicket(sellerId, 100, 'Coldplay');
	await paidOrder(t1);

	const res = await request(app)
		.get('/api/orders/earnings')
		.set('Cookie', cookie)
		.expect(200);

	expect(res.body.sales.length).toEqual(1);
	expect(res.body.sales[0].amount).toEqual(100);
	expect(res.body.sales[0].net).toEqual(90); // 100 − 10%
	expect(res.body.sales[0].title).toEqual('Coldplay');
	expect(res.body.sales[0].clearsAt).toBeTruthy();
	expect(res.body.totals.clearing).toEqual(90);
});

it('excludes swept, refunded, refund-requested, and other sellers’ sales', async () => {
	const sellerId = oid();
	const cookie = global.signin(sellerId);

	const mine = await buildTicket(sellerId, 50);
	const others = await buildTicket(oid(), 50);

	await paidOrder(mine, { payoutDueAt: new Date() }); // already swept → Held/Paid
	await paidOrder(mine, { refundRequestedAt: new Date() }); // refund pending
	await paidOrder(mine, { refundedAt: new Date(), refundAmount: 50 }); // refunded
	await paidOrder(others); // a different seller's sale
	await paidOrder(mine); // the one legit clearing sale

	const res = await request(app)
		.get('/api/orders/earnings')
		.set('Cookie', cookie)
		.expect(200);

	expect(res.body.sales.length).toEqual(1);
	expect(res.body.totals.clearing).toEqual(45); // 50 − 10%
});

it('is empty for a seller with no sales', async () => {
	const res = await request(app)
		.get('/api/orders/earnings')
		.set('Cookie', global.signin())
		.expect(200);

	expect(res.body.sales).toEqual([]);
	expect(res.body.totals.clearing).toEqual(0);
});

it('requires auth', async () => {
	await request(app).get('/api/orders/earnings').expect(401);
});
