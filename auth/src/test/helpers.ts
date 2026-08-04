import request from 'supertest';
import { JSONCodec } from 'nats';
import { app } from '../app';
import { natsWrapper } from '../nats-wrapper';

const jc = JSONCodec<{ email: string; token: string }>();

// Pull the raw token out of the (mocked) published event — that's the only
// place it exists in the clear, since the DB stores just a hash.
export const lastPublishedToken = (): string => {
	const calls = (natsWrapper.js.publish as jest.Mock).mock.calls;
	const last = calls[calls.length - 1];
	return jc.decode(last[1]).token;
};

// Sign up a fresh user and return { cookie, id, body } so tests can drive the
// authed routes and resolve the id via the public reads.
export const signupUser = async (email: string, password = '123456') => {
	const res = await request(app)
		.post('/api/users/signup')
		.send({ email, password })
		.expect(201);
	return { cookie: res.get('Set-Cookie')!, id: res.body.id as string, body: res.body };
};
