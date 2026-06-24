import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../app';
import mongoose from 'mongoose';
import { Order, OrderStatus } from '../../models/order';
import { Ticket } from '../../models/ticket';
import { natsWrapper } from '../../nats-wrapper';

// A signed-in but email-unverified user (#7). global.signin is verified.
const unverifiedCookie = () => {
	const token = jwt.sign(
		{
			id: new mongoose.Types.ObjectId().toHexString(),
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
		.send({ ticketId: new mongoose.Types.ObjectId().toHexString() })
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
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 100,
	});
	await ticket.save();

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
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 100,
		quantity: 4,
	});
	await ticket.save();

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
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 100,
		quantity: 4,
	});
	await ticket.save();
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
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 100,
		quantity: 4,
	});
	await ticket.save();
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

it('rejects an invalid quantity', async () => {
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 100,
		quantity: 4,
	});
	await ticket.save();

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({ ticketId: ticket.id, quantity: 0 })
		.expect(400);
});

it('returns an error if the user tries to buy their own ticket', async () => {
	const userId = new mongoose.Types.ObjectId().toHexString();

	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 100,
		userId,
	});
	await ticket.save();

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin(userId))
		.send({
			ticketId: ticket.id,
		})
		.expect(400);
});

it('returns an error if the ticket has been unlisted', async () => {
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 100,
		unlisted: true,
	});
	await ticket.save();

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({
			ticketId: ticket.id,
		})
		.expect(400);
});

it('reserves a ticket', async () => {
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 100,
	});
	await ticket.save();

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({
			ticketId: ticket.id,
		})
		.expect(201);
});

it('emits an order created event', async () => {
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 100,
	});
	await ticket.save();

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({
			ticketId: ticket.id,
		})
		.expect(201);

	expect(natsWrapper.js.publish).toHaveBeenCalled();
});
