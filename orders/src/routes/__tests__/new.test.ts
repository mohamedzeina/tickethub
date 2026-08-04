import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../app';
import mongoose from 'mongoose';
import { Ticket } from '../../models/ticket';
import { natsWrapper } from '../../nats-wrapper';
import { oid, buildTicket } from '../../test/factories';

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
		.post('/api/orders')
		.set('Cookie', unverifiedCookie())
		.send({ ticketId: oid() })
		.expect(403);
});

it('returns an error if the ticket does not exist', async () => {
	const ticketId = new mongoose.Types.ObjectId();

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({
			ticketId,
		})
		.expect(404);
});

it('returns an error if the ticket is sold out', async () => {
	const ticket = await buildTicket({ price: 100 });

	// Claim the listing's only seat so no capacity remains.
	await Ticket.reserveSeats(ticket.id, 1);

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({
			ticketId: ticket.id,
		})
		.expect(400);
});

it('reserves multiple seats and records the quantity on the order', async () => {
	const ticket = await buildTicket({ price: 100, quantity: 4 });

	const res = await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({ ticketId: ticket.id, quantity: 3 })
		.expect(201);

	expect(res.body.quantity).toEqual(3);
	const updated = await Ticket.findById(ticket.id);
	expect(updated!.reservedSeats).toEqual(3);
});

it('leaves remaining seats reservable after a partial buy', async () => {
	const ticket = await buildTicket({ price: 100, quantity: 4 });
	await Ticket.reserveSeats(ticket.id, 3);

	// One seat left: buying it succeeds...
	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({ ticketId: ticket.id, quantity: 1 })
		.expect(201);

	// ...and the listing is now sold out.
	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({ ticketId: ticket.id, quantity: 1 })
		.expect(400);
});

it('rejects an order for more seats than remain', async () => {
	const ticket = await buildTicket({ price: 100, quantity: 4 });
	await Ticket.reserveSeats(ticket.id, 3);

	// Only 1 left — asking for 2 is refused and claims nothing.
	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({ ticketId: ticket.id, quantity: 2 })
		.expect(400);

	const updated = await Ticket.findById(ticket.id);
	expect(updated!.reservedSeats).toEqual(3);
});

it('quotes the post-contention seat count in the sold-out message', async () => {
	const ticket = await buildTicket({ price: 100, quantity: 4 });
	await Ticket.reserveSeats(ticket.id, 2); // 2 free when the route reads the ticket

	// A competing buyer lands between that read and our reservation: they take a
	// seat, and our 3-seat claim comes back empty. The message must describe what
	// is left NOW (1), not the count from the stale pre-reservation snapshot (2).
	const reserveSeats = Ticket.reserveSeats.bind(Ticket);
	jest.spyOn(Ticket, 'reserveSeats').mockImplementationOnce(async (id) => {
		await reserveSeats(id, 1);
		return null;
	});

	const res = await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({ ticketId: ticket.id, quantity: 3 })
		.expect(400);

	expect(res.body.errors[0].message).toEqual('Only 1 seat left');
});

it('rejects an invalid quantity', async () => {
	const ticket = await buildTicket({ price: 100, quantity: 4 });

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({ ticketId: ticket.id, quantity: 0 })
		.expect(400);
});

it('returns an error if the user tries to buy their own ticket', async () => {
	const userId = oid();

	const ticket = await buildTicket({ price: 100, userId });

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin(userId))
		.send({
			ticketId: ticket.id,
		})
		.expect(400);
});

it('returns an error if the ticket has been unlisted', async () => {
	const ticket = await buildTicket({ price: 100, unlisted: true });

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({
			ticketId: ticket.id,
		})
		.expect(400);
});

it('reserves a ticket', async () => {
	const ticket = await buildTicket({ price: 100 });

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({
			ticketId: ticket.id,
		})
		.expect(201);
});

it('emits an order created event', async () => {
	const ticket = await buildTicket({ price: 100 });

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({
			ticketId: ticket.id,
		})
		.expect(201);

	expect(natsWrapper.js.publish).toHaveBeenCalled();
});
