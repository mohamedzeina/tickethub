import request from 'supertest';
import { app } from '../../app';
import { natsWrapper } from '../../nats-wrapper';
import { lastPublishedToken, signupUser } from '../../test/helpers';

it('requires authentication', async () => {
	await request(app).post('/api/users/resend-verification').send({}).expect(401);
});

it('publishes a fresh verification request for an unverified user', async () => {
	const { cookie } = await signupUser('resend@test.com');
	(natsWrapper.js.publish as jest.Mock).mockClear();

	await request(app)
		.post('/api/users/resend-verification')
		.set('Cookie', cookie)
		.send({})
		.expect(200);

	expect(natsWrapper.js.publish).toHaveBeenCalled();
});

it('does not re-publish once the user is already verified', async () => {
	const { cookie } = await signupUser('resend@test.com');

	// Verify via the published token first.
	const token = lastPublishedToken();
	await request(app).post('/api/users/verify-email').send({ token }).expect(200);

	(natsWrapper.js.publish as jest.Mock).mockClear();
	await request(app)
		.post('/api/users/resend-verification')
		.set('Cookie', cookie)
		.send({})
		.expect(200);

	expect(natsWrapper.js.publish).not.toHaveBeenCalled();
});
