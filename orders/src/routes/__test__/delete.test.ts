import request from 'supertest';
import { app } from '../../app';

import { Ticket } from '../../models/ticket';
import { OrderStatus } from '@zeina-tickethub/common';

it('cancels the order', async () => {
	const ticket = Ticket.build({
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

	expect(canceledOrder!.status).toEqual(OrderStatus.Canceled);
});

it('returns unauthorized error if user tries to cancel an order that does not belong to them', async () => {
	const ticket = Ticket.build({
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

it.todo('emits an order cancelled event');
