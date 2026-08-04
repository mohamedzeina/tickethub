import request from 'supertest';
import { app } from '../../app';
import { User } from '../../models/user';
import { natsWrapper } from '../../nats-wrapper';
import { lastPublishedToken, signupUser } from '../../test/helpers';

const signupAndGetToken = async (email = 'verify@test.com') => {
	await signupUser(email);
	return lastPublishedToken();
};

it('publishes a verification request on signup', async () => {
	await request(app)
		.post('/api/users/signup')
		.send({ email: 'verify@test.com', password: '123456' })
		.expect(201);

	expect(natsWrapper.js.publish).toHaveBeenCalled();
});

it('new users start unverified', async () => {
	await signupAndGetToken();
	const user = await User.findOne({ email: 'verify@test.com' });
	expect(user!.emailVerified).toBe(false);
});

it('verifies the email with a valid token', async () => {
	const token = await signupAndGetToken();

	await request(app)
		.post('/api/users/verify-email')
		.send({ token })
		.expect(200);

	const user = await User.findOne({ email: 'verify@test.com' });
	expect(user!.emailVerified).toBe(true);
	expect(user!.verificationToken).toBeUndefined();
});

it('refreshes the session cookie on verify', async () => {
	const token = await signupAndGetToken();
	const response = await request(app)
		.post('/api/users/verify-email')
		.send({ token })
		.expect(200);

	expect(response.get('Set-Cookie')).toBeDefined();
});

it('returns 400 for an unknown token', async () => {
	await request(app)
		.post('/api/users/verify-email')
		.send({ token: 'not-a-real-token' })
		.expect(400);
});

it('returns 400 when the token is missing', async () => {
	await request(app).post('/api/users/verify-email').send({}).expect(400);
});

it('rejects a token that has already been used', async () => {
	const token = await signupAndGetToken();
	await request(app).post('/api/users/verify-email').send({ token }).expect(200);
	// Second use — token was cleared.
	await request(app).post('/api/users/verify-email').send({ token }).expect(400);
});
