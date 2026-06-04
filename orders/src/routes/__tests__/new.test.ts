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

it('returns an error if the ticket is already reserved', async () => {
	const ticket = Ticket.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		title: 'Akon Concert',
		price: 100,
	});
	await ticket.save();

	const order = Order.build({
		userId: 'asfafafas',
		ticket,
		status: OrderStatus.Created,
		expiresAt: new Date(),
	});
	await order.save();

	await request(app)
		.post('/api/orders')
		.set('Cookie', global.signin())
		.send({
			ticketId: ticket.id,
		})
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
