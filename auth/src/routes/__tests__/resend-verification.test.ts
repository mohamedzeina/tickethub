import request from 'supertest';
import { app } from '../../app';
import { natsWrapper } from '../../nats-wrapper';

const signup = async (email = 'resend@test.com') => {
	const response = await request(app)
		.post('/api/users/signup')
		.send({ email, password: '123456' })
		.expect(201);
	return response.get('Set-Cookie')!;
};

it('requires authentication', async () => {
	await request(app).post('/api/users/resend-verification').send({}).expect(401);
});

it('publishes a fresh verification request for an unverified user', async () => {
	const cookie = await signup();
	(natsWrapper.js.publish as jest.Mock).mockClear();

	await request(app)
		.post('/api/users/resend-verification')
		.set('Cookie', cookie)
		.send({})
		.expect(200);

	expect(natsWrapper.js.publish).toHaveBeenCalled();
});

it('does not re-publish once the user is already verified', async () => {
	const cookie = await signup();

	// Verify via the published token first.
	const { JSONCodec } = require('nats');
	const jc = JSONCodec();
	const calls = (natsWrapper.js.publish as jest.Mock).mock.calls;
	const token = jc.decode(calls[calls.length - 1][1]).token;
	await request(app).post('/api/users/verify-email').send({ token }).expect(200);

	(natsWrapper.js.publish as jest.Mock).mockClear();
	await request(app)
		.post('/api/users/resend-verification')
		.set('Cookie', cookie)
		.send({})
		.expect(200);

	expect(natsWrapper.js.publish).not.toHaveBeenCalled();
});
