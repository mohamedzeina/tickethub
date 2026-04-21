import request from 'supertest';
import { app } from '../../app';
import { Ticket } from '../../models/ticket';

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

it('creates a ticket if valid title and price are provided', async () => {
	let tickets = await Ticket.find({});
	expect(tickets.length).toEqual(0);

	const title = 'test title';

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title,
			price: 20,
		})
		.expect(201);

	tickets = await Ticket.find({});
	expect(tickets.length).toEqual(1);
	expect(tickets[0].title).toEqual(title);
});
