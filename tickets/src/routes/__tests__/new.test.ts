import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../app';
import { oid } from '../../test/factories';
import { Ticket } from '../../models/ticket';
import { natsWrapper } from '../../nats-wrapper';

// A signed-in but email-unverified user (#7). global.signin is verified.
const unverifiedCookie = () => {
	const token = jwt.sign(
		{
			id: oid(),
			email: 'unverified@test.com',
			emailVerified: false,
		},
		process.env.JWT_KEY!,
	);
	const session = { jwt: token };
	const base64 = Buffer.from(JSON.stringify(session)).toString('base64');
	return [`session=${base64}`];
};

it('returns 403 when the signed-in user has not verified their email', async () => {
	await request(app)
		.post('/api/tickets')
		.set('Cookie', unverifiedCookie())
		.send({ title: 'Concert', price: 20 })
		.expect(403);
});

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

	expect(natsWrapper.js.publish).toHaveBeenCalled();
});

it('defaults a listing to a single fully-available seat', async () => {
	const { body } = await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: 'single seat',
			price: 20,
			eventDate: '2030-06-01',
			venue: 'Test Arena',
		})
		.expect(201);

	expect(body.quantity).toEqual(1);
	expect(body.availableQty).toEqual(1);
});

it('lists multiple seats, all initially available (#10)', async () => {
	const { body } = await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: 'four together',
			price: 20,
			quantity: 4,
			eventDate: '2030-06-01',
			venue: 'Test Arena',
		})
		.expect(201);

	expect(body.quantity).toEqual(4);
	expect(body.availableQty).toEqual(4);
});

it('rejects an invalid quantity', async () => {
	await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: 'bad qty',
			price: 20,
			quantity: 0,
			eventDate: '2030-06-01',
			venue: 'Test Arena',
		})
		.expect(400);

	await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: 'bad qty',
			price: 20,
			quantity: 2.5,
			eventDate: '2030-06-01',
			venue: 'Test Arena',
		})
		.expect(400);
});
