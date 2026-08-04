import request from 'supertest';
import { JSONCodec } from 'nats';
import { app } from '../../app';
import { Ticket } from '../../models/ticket';
import { natsWrapper } from '../../nats-wrapper';
import { oid } from '../../test/factories';
import { injectStaleDocRace } from '../../test/stale-doc-race';

// Event date + venue are required by the route, so include them wherever a
// request needs to pass validation and reach the handler.
const event = { eventDate: '2030-06-01', venue: 'Test Arena' };

it('returns a 404 if the provided ticket id does not exist', async () => {
	const id = oid();
	await request(app)
		.put(`/api/tickets/${id}`)
		.set('Cookie', global.signin())
		.send({
			title: 'Test title',
			price: '20',
			...event,
		})
		.expect(404);
});

it('returns a 401 if the user is not authenticated', async () => {
	const id = oid();
	await request(app)
		.put(`/api/tickets/${id}`)
		.send({
			title: 'Test title',
			price: '20',
			...event,
		})
		.expect(401);
});

it('returns a 401 if the user does not own the ticket', async () => {
	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', global.signin())
		.send({
			title: 'New test title',
			price: 1000,
			...event,
		})
		.expect(401);

	const ticketResponse = await request(app)
		.get(`/api/tickets/${response.body.id}`)
		.send({})
		.expect(200);

	expect(ticketResponse.body.title).toEqual(response.body.title);
	expect(ticketResponse.body.price).toEqual(response.body.price);
});

it('returns a 400 if the user provides an invalid title or price', async () => {
	const cookie = global.signin();

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: '',
			price: 20,
			...event,
		})
		.expect(400);

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: -10,
			...event,
		})
		.expect(400);
});

it('returns a 400 if the event date or venue is missing', async () => {
	const cookie = global.signin();

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: 'New title',
			price: 40,
			venue: 'Test Arena',
		})
		.expect(400);
});

it('updates the ticket provided valid inputs', async () => {
	const cookie = global.signin();

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	const newTitle = 'New title';
	const newPrice = 40;

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: newTitle,
			price: newPrice,
			eventDate: '2031-01-15',
			venue: 'New Stadium',
		})
		.expect(200);

	const ticketResponse = await request(app)
		.get(`/api/tickets/${response.body.id}`)
		.send({});

	expect(ticketResponse.body.title).toEqual(newTitle);
	expect(ticketResponse.body.price).toEqual(newPrice);
	expect(ticketResponse.body.venue).toEqual('New Stadium');
});

it('publishes an event', async () => {
	const cookie = global.signin();

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	const newTitle = 'New title';
	const newPrice = 40;

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: newTitle,
			price: newPrice,
			...event,
		})
		.expect(200);

	expect(natsWrapper.js.publish).toHaveBeenCalled();
});

it('keeps unlisted: true in the published event when editing a hidden listing', async () => {
	const cookie = global.signin();

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	// Hide the listing, then edit it while it's still hidden.
	await request(app)
		.delete(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send()
		.expect(200);

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: 'New title',
			price: 40,
			...event,
		})
		.expect(200);

	// The edit's payload must still carry unlisted: true. Omitting it made the
	// orders replica UNSET the flag (set(undefined) deletes the path), and
	// reserveSeats filters on `unlisted: { $ne: true }` — so a hidden listing
	// silently became buyable again after any edit.
	const published: any = (natsWrapper.js.publish as jest.Mock).mock.calls.pop();
	expect((JSONCodec().decode(published[1]) as any).unlisted).toEqual(true);

	// And the listing itself is still hidden.
	const latest = await Ticket.findById(response.body.id);
	expect(latest!.unlisted).toEqual(true);
});

it('rejects updates if the ticket is reserved', async () => {
	const cookie = global.signin();

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	const ticket = await Ticket.findById(response.body.id);
	// Simulate a sold-out / reserved listing: availableQty below quantity.
	ticket!.set({ availableQty: 0 });
	await ticket!.save();

	const newTitle = 'New title';
	const newPrice = 40;

	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', cookie)
		.send({
			title: newTitle,
			price: newPrice,
			...event,
		})
		.expect(400);
});

it('returns a 401 (not a 400) if a non-owner edits a reserved ticket', async () => {
	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', global.signin())
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	const ticket = await Ticket.findById(response.body.id);
	ticket!.set({ availableQty: 0 });
	await ticket!.save();

	// Checking reservations before ownership leaked "this stranger's listing is
	// reserved" via the 400. Ownership is checked first now, as in unlist.ts.
	await request(app)
		.put(`/api/tickets/${response.body.id}`)
		.set('Cookie', global.signin())
		.send({
			title: 'New test title',
			price: 1000,
			...event,
		})
		.expect(401);
});

it('returns a 400 (not a 500) if the ticket is reserved concurrently mid-edit', async () => {
	const cookie = global.signin();

	const response = await request(app)
		.post('/api/tickets')
		.set('Cookie', cookie)
		.send({
			title: 'Test title',
			price: 20,
			...event,
		})
		.expect(201);

	const id = response.body.id;

	const spy = injectStaleDocRace();

	const res = await request(app)
		.put(`/api/tickets/${id}`)
		.set('Cookie', cookie)
		.send({
			title: 'New title',
			price: 40,
			...event,
		})
		.expect(400);

	spy.mockRestore();

	// Assert the *specific* graceful message — not the generic "Something went
	// wrong" fallback an uncaught VersionError would otherwise produce. This is
	// what proves the fix rather than the 400 alone.
	expect(res.body.errors[0].message).toEqual(
		'This ticket was just reserved and can no longer be edited',
	);

	// The edit was rejected, so the reservation stands and details are unchanged.
	const latest = await Ticket.findById(id);
	expect(latest!.availableQty).toBeLessThan(latest!.quantity);
	expect(latest!.title).toEqual('Test title');
});
