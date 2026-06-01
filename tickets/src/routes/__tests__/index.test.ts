import request from 'supertest';
import { app } from '../../app';

const createTicket = (
	title: string,
	price: number,
	extra: Record<string, any> = {},
) => {
	return request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title,
			price,
			eventDate: '2030-06-01',
			venue: 'Test Arena',
			...extra,
		})
		.expect(201);
};

it('can fetch a list of tickets', async () => {
	await createTicket('Akon Concert', 40);
	await createTicket('David Guetta Concert', 30);
	await createTicket('Tame Impala Concert', 100);

	const response = await request(app).get('/api/tickets/').send().expect(200);

	expect(response.body.tickets.length).toEqual(3);
	expect(response.body.total).toEqual(3);
	expect(response.body.page).toEqual(1);
	expect(response.body.totalPages).toEqual(1);
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

	expect(response.body.tickets.length).toEqual(1);
	expect(response.body.tickets[0].id).toEqual(a.body.id);
});

it('searches by title and venue (case-insensitive, partial)', async () => {
	await createTicket('Taylor Swift', 200, { venue: 'SoFi Stadium' });
	await createTicket('Drake', 150, { venue: 'Madison Square Garden' });

	// Partial title match
	const byTitle = await request(app)
		.get('/api/tickets?q=tay')
		.send()
		.expect(200);
	expect(byTitle.body.tickets.length).toEqual(1);
	expect(byTitle.body.tickets[0].title).toEqual('Taylor Swift');

	// Venue match
	const byVenue = await request(app)
		.get('/api/tickets?q=madison')
		.send()
		.expect(200);
	expect(byVenue.body.tickets.length).toEqual(1);
	expect(byVenue.body.tickets[0].title).toEqual('Drake');
});

it('filters by category', async () => {
	await createTicket('A', 50, { category: 'Sports' });
	await createTicket('B', 60, { category: 'Concerts' });

	const response = await request(app)
		.get('/api/tickets?category=Sports')
		.send()
		.expect(200);

	expect(response.body.tickets.length).toEqual(1);
	expect(response.body.tickets[0].category).toEqual('Sports');
});

it('filters by price range', async () => {
	await createTicket('Cheap', 20);
	await createTicket('Mid', 60);
	await createTicket('Pricey', 200);

	const response = await request(app)
		.get('/api/tickets?minPrice=50&maxPrice=100')
		.send()
		.expect(200);

	expect(response.body.tickets.length).toEqual(1);
	expect(response.body.tickets[0].title).toEqual('Mid');
});

it('sorts by price ascending and descending', async () => {
	await createTicket('Cheap', 20);
	await createTicket('Mid', 60);
	await createTicket('Pricey', 200);

	const asc = await request(app)
		.get('/api/tickets?sort=price_asc')
		.send()
		.expect(200);
	expect(asc.body.tickets.map((t: any) => t.price)).toEqual([20, 60, 200]);

	const desc = await request(app)
		.get('/api/tickets?sort=price_desc')
		.send()
		.expect(200);
	expect(desc.body.tickets.map((t: any) => t.price)).toEqual([200, 60, 20]);
});

it('paginates results', async () => {
	for (let i = 0; i < 5; i++) {
		await createTicket(`Ticket ${i}`, 10 + i);
	}

	const page1 = await request(app)
		.get('/api/tickets?limit=2&page=1&sort=price_asc')
		.send()
		.expect(200);
	expect(page1.body.tickets.length).toEqual(2);
	expect(page1.body.total).toEqual(5);
	expect(page1.body.totalPages).toEqual(3);
	expect(page1.body.tickets.map((t: any) => t.price)).toEqual([10, 11]);

	const page3 = await request(app)
		.get('/api/tickets?limit=2&page=3&sort=price_asc')
		.send()
		.expect(200);
	expect(page3.body.tickets.length).toEqual(1);
	expect(page3.body.tickets.map((t: any) => t.price)).toEqual([14]);
});

it('rejects invalid query params with a 400', async () => {
	await request(app).get('/api/tickets?category=Bogus').send().expect(400);
	await request(app).get('/api/tickets?page=0').send().expect(400);
	await request(app).get('/api/tickets?limit=999').send().expect(400);
	await request(app).get('/api/tickets?sort=cheapest').send().expect(400);
});
