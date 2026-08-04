import request from 'supertest';
import { app } from '../../app';
import { buildTicket as buildTicketDoc } from '../../test/factories';

const buildTicket = (title: string, price: number) =>
	buildTicketDoc({ title, price });

it('fetches the orders for a particular user', async () => {
	// Create three tickets
	const ticketOne = await buildTicket('Ticket 1', 10);
	const ticketTwo = await buildTicket('Ticket 2', 20);
	const ticketThree = await buildTicket('Ticket 3', 30);

	const userOne = global.signin();
	const userTwo = global.signin();
	// Create one order as user #1
	await request(app)
		.post('/api/orders')
		.set('Cookie', userOne)
		.send({ ticketId: ticketOne.id })
		.expect(201);

	// Create two orders as user #2
	const { body: orderOne } = await request(app)
		.post('/api/orders')
		.set('Cookie', userTwo)
		.send({ ticketId: ticketTwo.id })
		.expect(201);

	const { body: orderTwo } = await request(app)
		.post('/api/orders')
		.set('Cookie', userTwo)
		.send({ ticketId: ticketThree.id })
		.expect(201);

	// Make request to get orders for user #2
	const response = await request(app)
		.get('/api/orders')
		.set('Cookie', userTwo)
		.expect(200);

	// Returns only user #2's orders, newest first (orderTwo was placed last).
	expect(response.body.length).toEqual(2);
	expect(response.body[0].id).toEqual(orderTwo.id);
	expect(response.body[1].id).toEqual(orderOne.id);
	expect(response.body[0].ticket.id).toEqual(ticketThree.id);
	expect(response.body[1].ticket.id).toEqual(ticketTwo.id);
});
