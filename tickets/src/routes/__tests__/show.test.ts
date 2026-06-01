import request from 'supertest';
import { app } from '../../app';
import mongoose from 'mongoose';
import { Ticket } from '../../models/ticket';

const event = { eventDate: '2030-06-01', venue: 'Test Arena' };

it('returns a 404 if the ticket is not found ', async () => {
	const id = new mongoose.Types.ObjectId().toHexString();
	await request(app).get(`/api/tickets/${id}`).send({}).expect(404);
});

it('returns a 404 for an unlisted ticket requested by a non-owner', async () => {
	const { body } = await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({ title: 'David Guetta Concert', price: 30, ...event })
		.expect(201);

	const ticket = await Ticket.findById(body.id);
	ticket!.set({ unlisted: true });
	await ticket!.save();

	// A signed-in stranger with the link
	await request(app)
		.get(`/api/tickets/${body.id}`)
		.set('Cookie', global.signin())
		.send()
		.expect(404);

	// And an anonymous visitor
	await request(app).get(`/api/tickets/${body.id}`).send().expect(404);
});

it('returns an unlisted ticket to its owner', async () => {
	const cookie = global.signin();

	const { body } = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({ title: 'David Guetta Concert', price: 30, ...event })
		.expect(201);

	const ticket = await Ticket.findById(body.id);
	ticket!.set({ unlisted: true });
	await ticket!.save();

	const res = await request(app)
		.get(`/api/tickets/${body.id}`)
		.set('Cookie', cookie)
		.send()
		.expect(200);

	expect(res.body.unlisted).toEqual(true);
});

it('returns a ticket if the ticket is found ', async () => {
	const title = 'David Guetta Concert';
	const price = 30;

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title,
			price,
			eventDate: '2030-06-01',
			venue: 'Test Arena',
		})
		.expect(201);

	const ticketResponse = await request(app)
		.get(`/api/tickets/${response.body.id}`)
		.send()
		.expect(200);

	expect(ticketResponse.body.title).toEqual(title);
	expect(ticketResponse.body.price).toEqual(price);
});
