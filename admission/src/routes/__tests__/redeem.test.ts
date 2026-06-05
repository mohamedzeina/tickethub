import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { Pass, PassStatus } from '../../models/pass';
import { signPass } from '../../services/code';
import { natsWrapper } from '../../nats-wrapper';

const GATE = 'test-gate-key'; // matches test/setup.ts

const buildPass = async (status: PassStatus = PassStatus.Issued) => {
	const pass = Pass.build({
		orderId: new mongoose.Types.ObjectId().toHexString(),
		buyerId: new mongoose.Types.ObjectId().toHexString(),
		ticketId: new mongoose.Types.ObjectId().toHexString(),
		eventTitle: 'Coldplay',
	});
	if (status !== PassStatus.Issued) pass.set({ status });
	await pass.save();
	return pass;
};

it('rejects a scan with no gate key', async () => {
	await request(app).post('/api/passes/redeem').send({ code: 'x' }).expect(401);
});

it('rejects a scan with a wrong gate key', async () => {
	await request(app)
		.post('/api/passes/redeem')
		.set('x-gate-key', 'wrong')
		.send({ code: 'x' })
		.expect(401);
});

it('returns valid:false for a forged/garbage code', async () => {
	const res = await request(app)
		.post('/api/passes/redeem')
		.set('x-gate-key', GATE)
		.send({ code: 'not-a-real-code' })
		.expect(200);
	expect(res.body.valid).toBe(false);
	expect(res.body.reason).toBe('invalid');
});

it('redeems a valid issued pass and publishes ticket:redeemed', async () => {
	const pass = await buildPass();

	const res = await request(app)
		.post('/api/passes/redeem')
		.set('x-gate-key', GATE)
		.send({ code: signPass(pass.id) })
		.expect(200);

	expect(res.body.valid).toBe(true);
	expect(res.body.eventTitle).toBe('Coldplay');

	const updated = await Pass.findById(pass.id);
	expect(updated!.status).toBe('redeemed');
	expect(updated!.redeemedAt).toBeTruthy();
	expect(natsWrapper.js.publish).toHaveBeenCalled();
});

it('rejects a second scan of the same pass (single-use)', async () => {
	const pass = await buildPass();
	const code = signPass(pass.id);

	await request(app).post('/api/passes/redeem').set('x-gate-key', GATE).send({ code }).expect(200);

	const res = await request(app)
		.post('/api/passes/redeem')
		.set('x-gate-key', GATE)
		.send({ code })
		.expect(200);
	expect(res.body.valid).toBe(false);
	expect(res.body.reason).toBe('redeemed');
});

it('rejects a revoked pass', async () => {
	const pass = await buildPass(PassStatus.Revoked);
	const res = await request(app)
		.post('/api/passes/redeem')
		.set('x-gate-key', GATE)
		.send({ code: signPass(pass.id) })
		.expect(200);
	expect(res.body.valid).toBe(false);
	expect(res.body.reason).toBe('revoked');
});
