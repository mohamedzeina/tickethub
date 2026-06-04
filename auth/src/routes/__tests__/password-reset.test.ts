import request from 'supertest';
import { JSONCodec } from 'nats';
import { app } from '../../app';
import { natsWrapper } from '../../nats-wrapper';

const jc = JSONCodec<{ email: string; token: string }>();

const lastPublishedToken = (): string => {
	const calls = (natsWrapper.js.publish as jest.Mock).mock.calls;
	const last = calls[calls.length - 1];
	return jc.decode(last[1]).token;
};

const signup = (email: string, password = '123456') =>
	request(app).post('/api/users/signup').send({ email, password }).expect(201);

it('returns 200 and publishes a reset request for a known email', async () => {
	await signup('reset@test.com');
	(natsWrapper.js.publish as jest.Mock).mockClear();

	await request(app)
		.post('/api/users/forgot-password')
		.send({ email: 'reset@test.com' })
		.expect(200);

	expect(natsWrapper.js.publish).toHaveBeenCalled();
});

it('returns 200 but publishes nothing for an unknown email (no enumeration)', async () => {
	(natsWrapper.js.publish as jest.Mock).mockClear();

	await request(app)
		.post('/api/users/forgot-password')
		.send({ email: 'nobody@test.com' })
		.expect(200);

	expect(natsWrapper.js.publish).not.toHaveBeenCalled();
});

it('rejects a forgot-password with an invalid email', async () => {
	await request(app)
		.post('/api/users/forgot-password')
		.send({ email: 'not-an-email' })
		.expect(400);
});

it('resets the password with a valid token and lets the user sign in', async () => {
	await signup('reset@test.com', '123456');

	await request(app)
		.post('/api/users/forgot-password')
		.send({ email: 'reset@test.com' })
		.expect(200);
	const token = lastPublishedToken();

	await request(app)
		.post('/api/users/reset-password')
		.send({ token, password: 'newpass' })
		.expect(200);

	// Old password no longer works...
	await request(app)
		.post('/api/users/signin')
		.send({ email: 'reset@test.com', password: '123456' })
		.expect(400);

	// ...new one does.
	await request(app)
		.post('/api/users/signin')
		.send({ email: 'reset@test.com', password: 'newpass' })
		.expect(200);
});

it('marks the email verified after a successful reset', async () => {
	await signup('reset@test.com');
	await request(app)
		.post('/api/users/forgot-password')
		.send({ email: 'reset@test.com' })
		.expect(200);
	const token = lastPublishedToken();

	const response = await request(app)
		.post('/api/users/reset-password')
		.send({ token, password: 'newpass' })
		.expect(200);

	expect(response.body.emailVerified).toBe(true);
});

it('rejects an invalid reset token', async () => {
	await request(app)
		.post('/api/users/reset-password')
		.send({ token: 'bogus', password: 'newpass' })
		.expect(400);
});

it('rejects a reset token that was already used', async () => {
	await signup('reset@test.com');
	await request(app)
		.post('/api/users/forgot-password')
		.send({ email: 'reset@test.com' })
		.expect(200);
	const token = lastPublishedToken();

	await request(app)
		.post('/api/users/reset-password')
		.send({ token, password: 'newpass' })
		.expect(200);
	await request(app)
		.post('/api/users/reset-password')
		.send({ token, password: 'another' })
		.expect(400);
});
