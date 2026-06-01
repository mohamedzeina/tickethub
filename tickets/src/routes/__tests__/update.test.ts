import request from 'supertest';
import { app } from '../../app';
import mongoose from 'mongoose';
import { Ticket } from '../../models/ticket';
import { natsWrapper } from '../../nats-wrapper';

// Event date + venue are required by the route, so include them wherever a
// request needs to pass validation and reach the handler.
const event = { eventDate: '2030-06-01', venue: 'Test Arena' };

it('returns a 404 if the provided ticket id does not exist', async () => {
	const id = new mongoose.Types.ObjectId().toHexString();
	await request(app)
		.put(`/api/tickets/${id}`)
		.set('Cookie', global.signin())
		.send({
			title: 'Test title',
			price: '20',
			...event,
		})
		.expect(404);
});

it('returns a 401 if the user is not authenticated', async () => {
	const id = new mongoose.Types.ObjectId().toHexString();
	await request(app)
		.put(`/api/tickets/${id}`)
		.send({
			title: 'Test title',
			price: '20',
			...event,
		})
		.expect(401);
});

it('returns a 401 if the user does not own the ticket', async () => {
	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', global.signin())
		.send({
			title: 'New test title',
			price: 1000,
			...event,
		})
		.expect(401);

	const ticketResponse = await request(app)
		.get(`/api/tickets/${response.body.id}`)
		.send({})
		.expect(200);

	expect(ticketResponse.body.title).toEqual(response.body.title);
	expect(ticketResponse.body.price).toEqual(response.body.price);
});

it('returns a 400 if the user provides an invalid title or price', async () => {
	const cookie = global.signin();

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: '',
			price: 20,
			...event,
		})
		.expect(400);

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: -10,
			...event,
		})
		.expect(400);
});

it('returns a 400 if the event date or venue is missing', async () => {
	const cookie = global.signin();

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: 'New title',
			price: 40,
			venue: 'Test Arena',
		})
		.expect(400);
});

it('updates the ticket provided valid inputs', async () => {
	const cookie = global.signin();

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	const newTitle = 'New title';
	const newPrice = 40;

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: newTitle,
			price: newPrice,
			eventDate: '2031-01-15',
			venue: 'New Stadium',
		})
		.expect(200);

	const ticketResponse = await request(app)
		.get(`/api/tickets/${response.body.id}`)
		.send({});

	expect(ticketResponse.body.title).toEqual(newTitle);
	expect(ticketResponse.body.price).toEqual(newPrice);
	expect(ticketResponse.body.venue).toEqual('New Stadium');
});

it('publishes an event', async () => {
	const cookie = global.signin();

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	const newTitle = 'New title';
	const newPrice = 40;

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: newTitle,
			price: newPrice,
			...event,
		})
		.expect(200);

	expect(natsWrapper.client.publish).toHaveBeenCalled();
});

it('rejects updates if the ticket is reserved', async () => {
	const cookie = global.signin();

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	const ticket = await Ticket.findById(response.body.id);
	ticket!.set({ orderId: new mongoose.Types.ObjectId().toHexString() });
	await ticket!.save();

	const newTitle = 'New title';
	const newPrice = 40;

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: newTitle,
			price: newPrice,
			...event,
		})
		.expect(400);
});
