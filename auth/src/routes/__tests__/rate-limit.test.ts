import request from 'supertest';
import { app } from '../../app';

// #13 abuse protection. The global setup disables the limiter so other route
// tests aren't coupled to it; here we turn it back on and prove it actually
// throttles. The disabled-check is evaluated per request, so toggling the env
// at runtime is enough — no module re-import needed.

beforeAll(() => {
	process.env.RATELIMIT_DISABLED = '';
});

afterAll(() => {
	process.env.RATELIMIT_DISABLED = 'true';
});

it('throttles repeated sign-in attempts for the same email with a 429 + Retry-After', async () => {
	const email = `brute-${Date.now()}@test.com`;

	// The per-email signin limit is 5 / window. First five wrong-credential
	// attempts get the normal 400; the sixth is blocked before the handler runs.
	for (let i = 0; i < 5; i++) {
		await request(app)
			.post('/api/users/signin')
			.send({ email, password: 'wrong-password' })
			.expect(400);
	}

	const blocked = await request(app)
		.post('/api/users/signin')
		.send({ email, password: 'wrong-password' })
		.expect(429);

	expect(blocked.headers['retry-after']).toBeDefined();
	expect(blocked.body.errors[0].message).toMatch(/too many sign-in attempts/i);
});

it('does not throttle a different email (limit is per-key)', async () => {
	// A fresh email is unaffected by the previous test's exhausted key.
	await request(app)
		.post('/api/users/signin')
		.send({ email: `fresh-${Date.now()}@test.com`, password: 'wrong-password' })
		.expect(400);
});
