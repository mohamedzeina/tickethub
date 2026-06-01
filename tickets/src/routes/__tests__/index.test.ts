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
