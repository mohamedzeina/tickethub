import request from 'supertest';
import { app } from '../../app';

const createTicket = (cookie: string[], title: string) =>
	request(app).post('/api/tickets').set('Cookie', cookie).send({
		title,
		price: 20,
		eventDate: '2030-06-01',
		venue: 'Test Arena',
		category: 'Concerts',
	});

it('returns 401 if the user is not signed in', async () => {
	await request(app).get('/api/tickets/mine').send().expect(401);
});

it('returns only the tickets owned by the current user', async () => {
	const userA = global.signin();
	const userB = global.signin();

	await createTicket(userA, 'A1').expect(201);
	await createTicket(userA, 'A2').expect(201);
	await createTicket(userB, 'B1').expect(201);

	const response = await request(app)
		.get('/api/tickets/mine')
		.set('Cookie', userA)
		.send()
		.expect(200);

	expect(response.body.length).toEqual(2);
	const titles = response.body.map((t: any) => t.title).sort();
	expect(titles).toEqual(['A1', 'A2']);
});
