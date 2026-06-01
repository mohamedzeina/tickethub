import request from 'supertest';
import { app } from '../../app';

const createTicket = (title: string, price: number) => {
	return request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title,
			price,
			eventDate: '2030-06-01',
			venue: 'Test Arena',
		})
		.expect(201);
};

it('can fetch a list of tickets', async () => {
	await createTicket('Akon Concert', 40);
	await createTicket('David Guetta Concert', 30);
	await createTicket('Tame Impala Concert', 100);

	const response = await request(app).get('/api/tickets/').send();

	expect(response.body.length).toEqual(3);
});

it('excludes unlisted tickets from the marketplace', async () => {
	const cookie = global.signin();
	const a = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({ title: 'Listed', price: 40, eventDate: '2030-06-01', venue: 'Arena' })
		.expect(201);
	const b = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({ title: 'Unlisted', price: 30, eventDate: '2030-06-01', venue: 'Arena' })
		.expect(201);

	// Unlist the second one.
	await request(app)
		.delete(`/api/tickets/${b.body.id}`)
		.set('Cookie', cookie)
		.send()
		.expect(200);

	const response = await request(app).get('/api/tickets/').send().expect(200);

	expect(response.body.length).toEqual(1);
	expect(response.body[0].id).toEqual(a.body.id);
});
