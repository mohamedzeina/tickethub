import request from 'supertest';
import { app } from '../../app';

it('responses with details about the current user', async () => {
	const response = await request(app)
		.post('/api/users/signup')
		.send({
			email: 'test@test.com',
			password: '123456',
		})
		.expect(201);

	const cookie = response.get('Set-Cookie');

	if (!cookie) {
		throw new Error('Cookie is not defined');
	}

	const res = await request(app)
		.get('/api/users/currentuser')
		.set('Cookie', cookie)
		.send()
		.expect(200);

	expect(res.body.currentUser.email).toEqual('test@test.com');
	expect(res.body.currentUser.id).toBeDefined();
});
