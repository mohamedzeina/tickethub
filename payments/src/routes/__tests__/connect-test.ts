import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../app';
import { ConnectedAccount } from '../../models/connected-account';

// Scope the Stripe mock to THIS file so the webhook tests keep using the real
// lib (they rely on stripe.webhooks.generateTestHeaderString for signing).
jest.mock('../../stripe', () => ({
	stripe: {
		accounts: {
			create: jest.fn(),
			retrieve: jest.fn(),
		},
		accountLinks: {
			create: jest.fn(),
		},
	},
}));
import { stripe } from '../../stripe';

const accountsCreate = stripe.accounts.create as jest.Mock;
const accountsRetrieve = stripe.accounts.retrieve as jest.Mock;
const accountLinksCreate = stripe.accountLinks.create as jest.Mock;

beforeEach(() => {
	accountsCreate.mockReset();
	accountsRetrieve.mockReset();
	accountLinksCreate.mockReset();
});

describe('POST /api/payments/connect/onboard', () => {
	it('requires auth', async () => {
		await request(app).post('/api/payments/connect/onboard').send({}).expect(401);
	});

	it('creates an Express account on first call and returns an onboarding url', async () => {
		accountsCreate.mockResolvedValue({ id: 'acct_123' });
		accountLinksCreate.mockResolvedValue({ url: 'https://connect.stripe.com/setup/abc' });

		const userId = new mongoose.Types.ObjectId().toHexString();

		const res = await request(app)
			.post('/api/payments/connect/onboard')
			.set('Cookie', global.signin(userId))
			.send({})
			.expect(200);

		expect(res.body.url).toEqual('https://connect.stripe.com/setup/abc');
		expect(accountsCreate).toHaveBeenCalledTimes(1);
		expect(accountsCreate.mock.calls[0][0]).toMatchObject({
			type: 'express',
			metadata: { userId },
		});

		const account = await ConnectedAccount.findOne({ userId });
		expect(account!.stripeAccountId).toEqual('acct_123');
		expect(account!.payoutsEnabled).toBe(false);
	});

	it('reuses the existing Express account on subsequent calls', async () => {
		accountsCreate.mockResolvedValue({ id: 'acct_123' });
		accountLinksCreate.mockResolvedValue({ url: 'https://connect.stripe.com/setup/abc' });

		const userId = new mongoose.Types.ObjectId().toHexString();
		const cookie = global.signin(userId);

		await request(app).post('/api/payments/connect/onboard').set('Cookie', cookie).send({}).expect(200);
		await request(app).post('/api/payments/connect/onboard').set('Cookie', cookie).send({}).expect(200);

		expect(accountsCreate).toHaveBeenCalledTimes(1); // not re-created
		const accounts = await ConnectedAccount.find({ userId });
		expect(accounts.length).toEqual(1);
	});
});

describe('GET /api/payments/connect/status', () => {
	it('requires auth', async () => {
		await request(app).get('/api/payments/connect/status').expect(401);
	});

	it('reports not-connected when the seller has no account', async () => {
		const res = await request(app)
			.get('/api/payments/connect/status')
			.set('Cookie', global.signin())
			.expect(200);

		expect(res.body).toEqual({
			connected: false,
			payoutsEnabled: false,
			detailsSubmitted: false,
		});
		expect(accountsRetrieve).not.toHaveBeenCalled();
	});

	it('returns cached flags WITHOUT calling Stripe by default', async () => {
		const userId = new mongoose.Types.ObjectId().toHexString();
		await ConnectedAccount.build({
			userId,
			stripeAccountId: 'acct_123',
			payoutsEnabled: true,
			detailsSubmitted: true,
		}).save();

		const res = await request(app)
			.get('/api/payments/connect/status')
			.set('Cookie', global.signin(userId))
			.expect(200);

		expect(res.body).toEqual({
			connected: true,
			payoutsEnabled: true,
			detailsSubmitted: true,
		});
		// The hot path (payout nudge on selling pages) must not hit Stripe.
		expect(accountsRetrieve).not.toHaveBeenCalled();
	});

	it('refreshes readiness flags from Stripe with ?refresh=1 and persists them', async () => {
		const userId = new mongoose.Types.ObjectId().toHexString();
		await ConnectedAccount.build({ userId, stripeAccountId: 'acct_123' }).save();

		accountsRetrieve.mockResolvedValue({
			payouts_enabled: true,
			details_submitted: true,
		});

		const res = await request(app)
			.get('/api/payments/connect/status?refresh=1')
			.set('Cookie', global.signin(userId))
			.expect(200);

		expect(res.body).toEqual({
			connected: true,
			payoutsEnabled: true,
			detailsSubmitted: true,
		});
		expect(accountsRetrieve).toHaveBeenCalledWith('acct_123');

		const account = await ConnectedAccount.findOne({ userId });
		expect(account!.payoutsEnabled).toBe(true);
		expect(account!.detailsSubmitted).toBe(true);
	});
});
