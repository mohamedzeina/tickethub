import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { Ticket } from '../../models/ticket';
import { natsWrapper } from '../../nats-wrapper';

const event = { eventDate: '2030-06-01', venue: 'Test Arena' };

const createTicket = (cookie: string[]) =>
	request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({ title: 'Test title', price: 20, ...event })
		.expect(201);

it('returns a 401 if the user is not signed in', async () => {
	const id = new mongoose.Types.ObjectId().toHexString();
	await request(app).delete(`/api/tickets/${id}`).send().expect(401);
});

it('returns a 404 if the ticket does not exist', async () => {
	const id = new mongoose.Types.ObjectId().toHexString();
	await request(app)
		.delete(`/api/tickets/${id}`)
		.set('Cookie', global.signin())
		.send()
		.expect(404);
});

it('returns a 401 if the user does not own the ticket', async () => {
	const { body } = await createTicket(global.signin());

	await request(app)
		.delete(`/api/tickets/${body.id}`)
		.set('Cookie', global.signin()) // a different user
		.send()
		.expect(401);

	const ticket = await Ticket.findById(body.id);
	expect(ticket!.unlisted).toEqual(false);
});

it('returns a 400 when trying to unlist a reserved ticket', async () => {
	const cookie = global.signin();
	const { body } = await createTicket(cookie);

	const ticket = await Ticket.findById(body.id);
	ticket!.set({ orderId: new mongoose.Types.ObjectId().toHexString() });
	await ticket!.save();

	await request(app)
		.delete(`/api/tickets/${body.id}`)
		.set('Cookie', cookie)
		.send()
		.expect(400);
});

it('unlists the ticket when the owner deletes it', async () => {
	const cookie = global.signin();
	const { body } = await createTicket(cookie);

	await request(app)
		.delete(`/api/tickets/${body.id}`)
		.set('Cookie', cookie)
		.send()
		.expect(200);

	const ticket = await Ticket.findById(body.id);
	expect(ticket!.unlisted).toEqual(true);
});

it('bumps the version and publishes a ticket:updated event when unlisting', async () => {
	const cookie = global.signin();
	const { body } = await createTicket(cookie);

	const before = await Ticket.findById(body.id);

	await request(app)
		.delete(`/api/tickets/${body.id}`)
		.set('Cookie', cookie)
		.send()
		.expect(200);

	// Version advances in lockstep with consumers, and the event carries the flag
	// so the orders service can stop the listing being reserved.
	const after = await Ticket.findById(body.id);
	expect(after!.version).toEqual(before!.version + 1);
	expect(natsWrapper.client.publish).toHaveBeenCalled();

	const published: any = (natsWrapper.client.publish as jest.Mock).mock.calls.pop();
	expect(JSON.parse(published[1]).unlisted).toEqual(true);
});

it('relists an unlisted ticket for the owner', async () => {
	const cookie = global.signin();
	const { body } = await createTicket(cookie);

	await request(app)
		.delete(`/api/tickets/${body.id}`)
		.set('Cookie', cookie)
		.send()
		.expect(200);

	await request(app)
		.post(`/api/tickets/${body.id}/relist`)
		.set('Cookie', cookie)
		.send()
		.expect(200);

	const ticket = await Ticket.findById(body.id);
	expect(ticket!.unlisted).toEqual(false);
});
