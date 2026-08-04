import request from 'supertest';
import { app } from '../../app';
import { User } from '../../models/user';

it('returns a 201 on successful signup', async () => {
	return request(app)
		.post('/api/users/signup')
		.send({
			email: 'test@test.com',
			password: '123456',
		})
		.expect(201);
});

it('returns a 400 with an invalid password', async () => {
	return request(app)
		.post('/api/users/signup')
		.send({
			email: 'test@test.com',
			password: '123',
		})
		.expect(400);
});

it('returns a 400 with an invalid email', async () => {
	return request(app)
		.post('/api/users/signup')
		.send({
			email: 'test',
			password: '1234',
		})
		.expect(400);
});

it('returns a 400 with empty email and password', async () => {
	await request(app)
		.post('/api/users/signup')
		.send({
			email: 'test@test.com',
		})
		.expect(400);

	await request(app)
		.post('/api/users/signup')
		.send({
			password: '123456',
		})
		.expect(400);
});

it('should disallow signing up with an email that is already in use', async () => {
	await request(app)
		.post('/api/users/signup')
		.send({
			email: 'test@test.com',
			password: '123456',
		})
		.expect(201);

	await request(app)
		.post('/api/users/signup')
		.send({
			email: 'test@test.com',
			password: '123456',
		})
		.expect(400);
});

it('sets a cookie after successful signup', async () => {
	const response = await request(app)
		.post('/api/users/signup')
		.send({
			email: 'test@test.com',
			password: '123456',
		})
		.expect(201);

	expect(response.get('Set-Cookie')).toBeDefined();
});

it('treats a case-variant email as the same account', async () => {
	await request(app)
		.post('/api/users/signup')
		.send({ email: 'Casey@Example.com', password: '123456' })
		.expect(201);

	// Signing up again with different casing used to create a SECOND account:
	// the duplicate check queried case-sensitively, so it never matched.
	await request(app)
		.post('/api/users/signup')
		.send({ email: 'casey@example.com', password: '123456' })
		.expect(400);

	// Surrounding whitespace is not a new account either.
	await request(app)
		.post('/api/users/signup')
		.send({ email: '  CASEY@EXAMPLE.COM  ', password: '123456' })
		.expect(400);
});

it('stores the email lowercased and signs in regardless of casing', async () => {
	const created = await request(app)
		.post('/api/users/signup')
		.send({ email: 'Dana@Example.com', password: '123456' })
		.expect(201);
	expect(created.body.email).toEqual('dana@example.com');

	await request(app)
		.post('/api/users/signin')
		.send({ email: 'DANA@example.COM', password: '123456' })
		.expect(200);
});

it('closes the signup race with the unique index, not just the pre-check', async () => {
	// deleteMany between tests keeps indexes, but build it explicitly so this
	// test does not depend on another having run first.
	await User.init();

	// Fire both signups together so they interleave around the findOne()
	// pre-check. Without the unique index this creates TWO accounts.
	const results = await Promise.all([
		request(app).post('/api/users/signup').send({ email: 'race@test.com', password: '123456' }),
		request(app).post('/api/users/signup').send({ email: 'race@test.com', password: '123456' }),
	]);

	const statuses = results.map((r) => r.status).sort();
	expect(statuses).toEqual([201, 400]);
	// The loser gets the friendly duplicate message, not a 500.
	const loser = results.find((r) => r.status === 400)!;
	expect(loser.body.errors[0].message).toEqual('Email already in use');

	expect(await User.countDocuments({ email: 'race@test.com' })).toEqual(1);
});
