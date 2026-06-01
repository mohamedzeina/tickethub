import request from 'supertest';
import { app } from '../../app';
import { Ticket } from '../../models/ticket';
import { natsWrapper } from '../../nats-wrapper';

it('has a route handler listening to /api/tickets for post request', async () => {
	const response = await request(app).post('/api/tickets').send({});

	expect(response.status).not.toEqual(404);
});

it('can only be accessed by logged-in users', async () => {
	await request(app).post('/api/tickets').send({}).expect(401);
});

it('returns a status code other than 401 for users who are signed in ', async () => {
	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({});

	expect(response.status).not.toEqual(401);
});

it('returns an error if an invalid title is provided', async () => {
	await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: '',
			price: 10,
		})
		.expect(400);

	await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			price: 10,
		})
		.expect(400);
});

it('returns an error if an invalid price is provided', async () => {
	await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: 'assfaad',
			price: -10,
		})
		.expect(400);

	await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: '',
		})
		.expect(400);
});

it('returns an error if event date or venue is missing', async () => {
	await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: 'test title',
			price: 20,
			venue: 'Test Arena',
		})
		.expect(400);

	await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: 'test title',
			price: 20,
			eventDate: '2030-06-01',
		})
		.expect(400);
});

it('returns an error if the event date is in the past', async () => {
	await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: 'test title',
			price: 20,
			eventDate: '2000-01-01',
			venue: 'Test Arena',
		})
		.expect(400);
});

it('creates a ticket if valid inputs are provided', async () => {
	let tickets = await Ticket.find({});
	expect(tickets.length).toEqual(0);

	const title = 'test title';

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title,
			price: 20,
			eventDate: '2030-06-01',
			venue: 'Test Arena',
			category: 'Concerts',
		})
		.expect(201);

	tickets = await Ticket.find({});
	expect(tickets.length).toEqual(1);
	expect(tickets[0].title).toEqual(title);
	expect(tickets[0].venue).toEqual('Test Arena');
	expect(tickets[0].category).toEqual('Concerts');
});

it('publishes an event', async () => {
	const title = 'test title';

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title,
			price: 20,
			eventDate: '2030-06-01',
			venue: 'Test Arena',
		})
		.expect(201);

	expect(natsWrapper.client.publish).toHaveBeenCalled();
});
