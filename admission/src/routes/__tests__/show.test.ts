import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { Pass, PassStatus } from '../../models/pass';

const buildPass = async (overrides: Record<string, any> = {}) => {
	const pass = Pass.build({
		orderId: new mongoose.Types.ObjectId().toHexString(),
		buyerId: new mongoose.Types.ObjectId().toHexString(),
		ticketId: new mongoose.Types.ObjectId().toHexString(),
		eventTitle: 'Coldplay',
		venue: 'Wembley',
		...overrides,
	});
	await pass.save();
	return pass;
};

it('requires authentication', async () => {
	const orderId = new mongoose.Types.ObjectId().toHexString();
	await request(app).get(`/api/passes/order/${orderId}`).send().expect(401);
});

it('404s when no pass exists for the order', async () => {
	const orderId = new mongoose.Types.ObjectId().toHexString();
	await request(app)
		.get(`/api/passes/order/${orderId}`)
		.set('Cookie', global.signin())
		.send()
		.expect(404);
});

it("401s when the requester isn't the pass owner", async () => {
	const pass = await buildPass();
	await request(app)
		.get(`/api/passes/order/${pass.orderId}`)
		.set('Cookie', global.signin())
		.send()
		.expect(401);
});

it('returns the pass and a signed code to the owner', async () => {
	const buyerId = new mongoose.Types.ObjectId().toHexString();
	const pass = await buildPass({ buyerId });

	const res = await request(app)
		.get(`/api/passes/order/${pass.orderId}`)
		.set('Cookie', global.signin(buyerId))
		.send()
		.expect(200);

	expect(res.body.passes).toHaveLength(1);
	const [p] = res.body.passes;
	expect(p.status).toEqual('issued');
	expect(p.seat).toEqual(1);
	expect(p.eventTitle).toEqual('Coldplay');
	expect(typeof p.code).toEqual('string');
	expect(p.code.startsWith(pass.id)).toBe(true);
});

it('returns every seat pass for a multi-seat order (#10)', async () => {
	const buyerId = new mongoose.Types.ObjectId().toHexString();
	const orderId = new mongoose.Types.ObjectId().toHexString();
	const ticketId = new mongoose.Types.ObjectId().toHexString();

	// Mint 3 passes for one order, out of seat order.
	for (const seat of [2, 1, 3]) {
		await buildPass({ buyerId, orderId, ticketId, seat });
	}

	const res = await request(app)
		.get(`/api/passes/order/${orderId}`)
		.set('Cookie', global.signin(buyerId))
		.send()
		.expect(200);

	expect(res.body.passes).toHaveLength(3);
	// Sorted by seat, each with its own distinct code.
	expect(res.body.passes.map((p: any) => p.seat)).toEqual([1, 2, 3]);
	const codes = res.body.passes.map((p: any) => p.code);
	expect(new Set(codes).size).toEqual(3);
});

it('hides the code once the pass is no longer issued', async () => {
	const buyerId = new mongoose.Types.ObjectId().toHexString();
	const pass = await buildPass({ buyerId });
	pass.set({ status: PassStatus.Redeemed });
	await pass.save();

	const res = await request(app)
		.get(`/api/passes/order/${pass.orderId}`)
		.set('Cookie', global.signin(buyerId))
		.send()
		.expect(200);

	const [p] = res.body.passes;
	expect(p.status).toEqual('redeemed');
	expect(p.code).toBeNull();
});
