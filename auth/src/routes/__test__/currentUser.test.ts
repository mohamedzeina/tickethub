import request from 'supertest';
import { app } from '../../app';

it('responses with details about the current user', async () => {
	const cookie = await global.signin();

	const res = await request(app)
		.get('/api/users/currentuser')
		.set('Cookie', cookie)
		.send()
		.expect(200);

	expect(res.body.currentUser.email).toEqual('test@test.com');
	expect(res.body.currentUser.id).toBeDefined();
});

it('responds with null if not authenticated', async () => {
	const response = await request(app)
		.get('/api/users/currentuser')
		.send()
		.expect(200);

	expect(response.body.currentUser).toEqual(null);
});
