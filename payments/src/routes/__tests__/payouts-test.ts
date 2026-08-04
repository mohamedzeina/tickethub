import request from 'supertest';
import { app } from '../../app';
import { Payout } from '../../models/payout';
import { oid } from '../../test/helpers';

it('requires auth', async () => {
	await request(app).get('/api/payments/payouts').expect(401);
});

it('returns the seller’s payouts with net pending/paid totals', async () => {
	const sellerId = oid();
	await Payout.build({
		orderId: oid(),
		sellerId,
		amount: 100,
		fee: 10,
		status: 'paid',
		transferId: 'tr_1',
	}).save();
	await Payout.build({
		orderId: oid(),
		sellerId,
		amount: 50,
		fee: 5,
		status: 'pending_account',
	}).save();
	// Another seller's payout must not leak in.
	await Payout.build({
		orderId: oid(),
		sellerId: oid(),
		amount: 999,
		fee: 99,
		status: 'paid',
	}).save();

	const res = await request(app)
		.get('/api/payments/payouts')
		.set('Cookie', global.signin(sellerId))
		.expect(200);

	expect(res.body.totals).toEqual({ paid: 90, pending: 45 });
	expect(res.body.payouts).toHaveLength(2);
	expect(res.body.payouts.map((p: any) => p.net).sort()).toEqual([45, 90]);
});
