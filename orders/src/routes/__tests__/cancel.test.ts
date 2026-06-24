import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';

import { Ticket } from '../../models/ticket';
import { OrderStatus } from '@zeina-tickethub/common';
import { natsWrapper } from '../../nats-wrapper';

it('cancels the order', async () => {
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 50,
	});
	await ticket.save();

	const user = global.signin();
	const { body: order } = await request(app)
		.post('/api/orders')
		.set('Cookie', user)
		.send({ ticketId: ticket.id })
		.expect(201);

	await request(app)
		.delete(`/api/orders/${order.id}`)
		.set('Cookie', user)
		.send()
		.expect(204);

	const { body: canceledOrder } = await request(app)
		.get(`/api/orders/${order.id}`)
		.set('Cookie', user)
		.send()
		.expect(200);

	expect(canceledOrder!.status).toEqual(OrderStatus.Cancelled);
});

it('returns unauthorized error if user tries to cancel an order that does not belong to them', async () => {
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 50,
	});
	await ticket.save();

	const user = global.signin();
	const { body: order } = await request(app)
		.post('/api/orders')
		.set('Cookie', user)
		.send({ ticketId: ticket.id })
		.expect(201);

	await request(app)
		.delete(`/api/orders/${order.id}`)
		.set('Cookie', global.signin())
		.expect(401);
});

it('returns the held seats to the listing and is idempotent on a second cancel', async () => {
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 50,
		quantity: 4,
	});
	await ticket.save();

	const user = global.signin();
	const { body: order } = await request(app)
		.post('/api/orders')
		.set('Cookie', user)
		.send({ ticketId: ticket.id, quantity: 3 })
		.expect(201);

	expect((await Ticket.findById(ticket.id))!.reservedSeats).toEqual(3);

	await request(app)
		.delete(`/api/orders/${order.id}`)
		.set('Cookie', user)
		.expect(204);

	expect((await Ticket.findById(ticket.id))!.reservedSeats).toEqual(0);

	// A duplicate cancel must not over-credit the pool (reservedSeats stays 0).
	await request(app)
		.delete(`/api/orders/${order.id}`)
		.set('Cookie', user)
		.expect(204);

	expect((await Ticket.findById(ticket.id))!.reservedSeats).toEqual(0);
});

it('emits an order cancelled event', async () => {
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 50,
	});
	await ticket.save();

	const user = global.signin();
	const { body: order } = await request(app)
		.post('/api/orders')
		.set('Cookie', user)
		.send({ ticketId: ticket.id })
		.expect(201);

	await request(app)
		.delete(`/api/orders/${order.id}`)
		.set('Cookie', user)
		.send()
		.expect(204);

	expect(natsWrapper.js.publish).toHaveBeenCalled();
});
