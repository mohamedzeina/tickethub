import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { Wishlist } from '../../models/wishlist';
import { TicketRef } from '../../models/ticket-ref';

const id = () => new mongoose.Types.ObjectId().toHexString();

const seedTicket = async (overrides: any = {}) => {
	const ticketId = id();
	await TicketRef.build({
		id: ticketId,
		title: 'Coldplay',
		price: 100,
		version: 0,
		sellerId: id(),
		...overrides,
	}).save();
	return ticketId;
};

describe('POST /api/wishlists', () => {
	it('requires auth → 401', async () => {
		await request(app).post('/api/wishlists').send({ ticketId: id() }).expect(401);
	});

	it('rejects a missing/invalid ticketId → 400', async () => {
		await request(app)
			.post('/api/wishlists')
			.set('Cookie', global.signin())
			.send({ ticketId: 'not-an-id' })
			.expect(400);
	});

	it('saves a listing → 201 and persists one row', async () => {
		const userId = id();
		const ticketId = id();
		const res = await request(app)
			.post('/api/wishlists')
			.set('Cookie', global.signin(userId))
			.send({ ticketId })
			.expect(201);
		expect(res.body.saved).toBe(true);

		const rows = await Wishlist.find({ userId, ticketId });
		expect(rows.length).toBe(1);
	});

	it('is idempotent — saving twice keeps a single row', async () => {
		const userId = id();
		const ticketId = id();
		const cookie = global.signin(userId);
		await request(app).post('/api/wishlists').set('Cookie', cookie).send({ ticketId }).expect(201);
		await request(app).post('/api/wishlists').set('Cookie', cookie).send({ ticketId }).expect(201);

		const rows = await Wishlist.find({ userId, ticketId });
		expect(rows.length).toBe(1);
	});
});

describe('DELETE /api/wishlists/:ticketId', () => {
	it('removes the saved listing → 200', async () => {
		const userId = id();
		const ticketId = id();
		const cookie = global.signin(userId);
		await request(app).post('/api/wishlists').set('Cookie', cookie).send({ ticketId }).expect(201);

		await request(app).delete(`/api/wishlists/${ticketId}`).set('Cookie', cookie).expect(200);
		expect(await Wishlist.countDocuments({ userId, ticketId })).toBe(0);
	});

	it('is idempotent — removing one that is not there still → 200', async () => {
		await request(app)
			.delete(`/api/wishlists/${id()}`)
			.set('Cookie', global.signin())
			.expect(200);
	});
});

describe('GET /api/wishlists/ids', () => {
	it('returns only the requesting user’s saved ids', async () => {
		const me = id();
		const other = id();
		const a = id();
		const b = id();
		await request(app).post('/api/wishlists').set('Cookie', global.signin(me)).send({ ticketId: a }).expect(201);
		await request(app).post('/api/wishlists').set('Cookie', global.signin(me)).send({ ticketId: b }).expect(201);
		await request(app).post('/api/wishlists').set('Cookie', global.signin(other)).send({ ticketId: id() }).expect(201);

		const res = await request(app).get('/api/wishlists/ids').set('Cookie', global.signin(me)).expect(200);
		expect(res.body.ids.sort()).toEqual([a, b].sort());
	});
});

describe('GET /api/wishlists', () => {
	it('returns saved items joined with current ticket details, newest first', async () => {
		const userId = id();
		const cookie = global.signin(userId);
		const t1 = await seedTicket({ title: 'First', price: 50 });
		const t2 = await seedTicket({ title: 'Second', price: 75 });

		await request(app).post('/api/wishlists').set('Cookie', cookie).send({ ticketId: t1 }).expect(201);
		await request(app).post('/api/wishlists').set('Cookie', cookie).send({ ticketId: t2 }).expect(201);

		const res = await request(app).get('/api/wishlists').set('Cookie', cookie).expect(200);
		expect(res.body.length).toBe(2);
		// newest first → t2 then t1
		expect(res.body[0].ticketId).toBe(t2);
		expect(res.body[0].ticket.title).toBe('Second');
		expect(res.body[0].ticket.price).toBe(75);
		expect(res.body[1].ticketId).toBe(t1);
	});

	it('returns ticket: null for a saved id whose replica has not arrived', async () => {
		const userId = id();
		const cookie = global.signin(userId);
		const ghost = id();
		await request(app).post('/api/wishlists').set('Cookie', cookie).send({ ticketId: ghost }).expect(201);

		const res = await request(app).get('/api/wishlists').set('Cookie', cookie).expect(200);
		expect(res.body.length).toBe(1);
		expect(res.body[0].ticket).toBeNull();
	});
});
