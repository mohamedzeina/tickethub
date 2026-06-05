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

	expect(res.body.status).toEqual('issued');
	expect(res.body.eventTitle).toEqual('Coldplay');
	expect(typeof res.body.code).toEqual('string');
	expect(res.body.code.startsWith(pass.id)).toBe(true);
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

	expect(res.body.status).toEqual('redeemed');
	expect(res.body.code).toBeNull();
});
