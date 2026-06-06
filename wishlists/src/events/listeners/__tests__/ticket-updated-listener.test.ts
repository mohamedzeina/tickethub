import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { TicketUpdatedEvent, Subjects } from '@zeina-tickethub/common';
import { TicketUpdatedListener } from '../ticket-updated-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { TicketRef } from '../../../models/ticket-ref';
import { Wishlist } from '../../../models/wishlist';

const id = () => new mongoose.Types.ObjectId().toHexString();
const msg = (seq: number) => ({ ack: jest.fn(), seq }) as unknown as JsMsg;

// Seed a replica baseline + N watchers for a ticket.
const seed = async (ticketId: string, price: number, watchers: number) => {
	const sellerId = id();
	await TicketRef.build({ id: ticketId, title: 'Coldplay', price, version: 0, sellerId }).save();
	for (let i = 0; i < watchers; i++) {
		await Wishlist.build({
			userId: id(),
			ticketId,
			userEmail: `watcher${i}@test.com`,
		}).save();
	}
	return sellerId;
};

const evt = (ticketId: string, sellerId: string, over: Partial<TicketUpdatedEvent['data']> = {}): TicketUpdatedEvent['data'] => ({
	id: ticketId,
	version: 1,
	title: 'Coldplay',
	price: 80,
	userId: sellerId,
	...over,
});

const publishMock = () => natsWrapper.js.publish as jest.Mock;

it('publishes one price-drop event per watcher when the price drops', async () => {
	const ticketId = id();
	const sellerId = await seed(ticketId, 100, 3);
	const listener = new TicketUpdatedListener(natsWrapper.connection);

	await listener.onMessage(evt(ticketId, sellerId, { price: 80, version: 1 }), msg(1));

	expect(publishMock()).toHaveBeenCalledTimes(3);
	// The replica reflects the new price.
	const ref = await TicketRef.findById(ticketId);
	expect(ref!.price).toBe(80);
});

it('carries the captured watcher email + old/new price in the event', async () => {
	const ticketId = id();
	const sellerId = await seed(ticketId, 100, 1);
	const listener = new TicketUpdatedListener(natsWrapper.connection);

	await listener.onMessage(evt(ticketId, sellerId, { price: 60, version: 1 }), msg(1));

	const [subject, encoded] = publishMock().mock.calls[0];
	expect(subject).toBe(Subjects.WishlistPriceDropped);
	const payload = JSON.parse(Buffer.from(encoded).toString());
	expect(payload).toMatchObject({
		ticketId,
		email: 'watcher0@test.com',
		oldPrice: 100,
		newPrice: 60,
	});
});

it('does NOT publish when the price rises or is unchanged', async () => {
	const ticketId = id();
	const sellerId = await seed(ticketId, 100, 2);
	const listener = new TicketUpdatedListener(natsWrapper.connection);

	await listener.onMessage(evt(ticketId, sellerId, { price: 120, version: 1 }), msg(1));
	await listener.onMessage(evt(ticketId, sellerId, { price: 120, version: 2 }), msg(2));

	expect(publishMock()).not.toHaveBeenCalled();
});

it('suppresses the alert when the listing is unlisted (not really buyable)', async () => {
	const ticketId = id();
	const sellerId = await seed(ticketId, 100, 2);
	const listener = new TicketUpdatedListener(natsWrapper.connection);

	await listener.onMessage(evt(ticketId, sellerId, { price: 70, version: 1, unlisted: true }), msg(1));

	expect(publishMock()).not.toHaveBeenCalled();
});

it('ignores a stale/out-of-order update (version not newer)', async () => {
	const ticketId = id();
	const sellerId = await seed(ticketId, 100, 1);
	const listener = new TicketUpdatedListener(natsWrapper.connection);

	// Apply v2 (drop to 90) first...
	await listener.onMessage(evt(ticketId, sellerId, { price: 90, version: 2 }), msg(1));
	publishMock().mockClear();
	// ...then a stale v1 (price 50). It must be ignored: no publish, price stays 90.
	await listener.onMessage(evt(ticketId, sellerId, { price: 50, version: 1 }), msg(2));

	expect(publishMock()).not.toHaveBeenCalled();
	const ref = await TicketRef.findById(ticketId);
	expect(ref!.price).toBe(90);
});

it('does not publish when nobody is watching the ticket', async () => {
	const ticketId = id();
	const sellerId = await seed(ticketId, 100, 0);
	const listener = new TicketUpdatedListener(natsWrapper.connection);

	await listener.onMessage(evt(ticketId, sellerId, { price: 50, version: 1 }), msg(1));

	expect(publishMock()).not.toHaveBeenCalled();
});

it('seeds a baseline (no alert) when the update arrives before any create', async () => {
	const ticketId = id();
	const sellerId = id();
	const listener = new TicketUpdatedListener(natsWrapper.connection);

	await listener.onMessage(evt(ticketId, sellerId, { price: 80, version: 1 }), msg(1));

	expect(publishMock()).not.toHaveBeenCalled();
	const ref = await TicketRef.findById(ticketId);
	expect(ref!.price).toBe(80);
});

// ---- availability alerts (#16) -------------------------------------------

it('publishes wishlist:available per watcher when an unlisted listing is relisted', async () => {
	const ticketId = id();
	const sellerId = await seed(ticketId, 100, 2);
	// Start unavailable (unlisted).
	await TicketRef.updateOne({ _id: ticketId }, { unlisted: true, available: false, version: 1 });
	const listener = new TicketUpdatedListener(natsWrapper.connection);

	// Relist: unlisted=false, no orderId → available again.
	await listener.onMessage(evt(ticketId, sellerId, { price: 100, version: 2, unlisted: false }), msg(1));

	const calls = publishMock().mock.calls.filter(
		(c: any[]) => c[0] === Subjects.WishlistAvailable,
	);
	expect(calls.length).toBe(2);
	const payload = JSON.parse(Buffer.from(calls[0][1]).toString());
	expect(payload).toMatchObject({ ticketId, price: 100, email: 'watcher0@test.com' });
	const ref = await TicketRef.findById(ticketId);
	expect(ref!.available).toBe(true);
});

it('publishes wishlist:available when a reserved listing is freed (orderId cleared)', async () => {
	const ticketId = id();
	const sellerId = await seed(ticketId, 100, 1);
	// Start reserved (orderId set → unavailable).
	await TicketRef.updateOne({ _id: ticketId }, { available: false, version: 1 });
	const listener = new TicketUpdatedListener(natsWrapper.connection);

	// Hold freed: no orderId in the event → available again.
	await listener.onMessage(evt(ticketId, sellerId, { price: 100, version: 2 }), msg(1));

	const calls = publishMock().mock.calls.filter(
		(c: any[]) => c[0] === Subjects.WishlistAvailable,
	);
	expect(calls.length).toBe(1);
});

it('does NOT alert available when the listing gets reserved (available → unavailable)', async () => {
	const ticketId = id();
	const sellerId = await seed(ticketId, 100, 2); // seeded available
	const listener = new TicketUpdatedListener(natsWrapper.connection);

	// Reserve: orderId present → unavailable.
	await listener.onMessage(evt(ticketId, sellerId, { price: 100, version: 1, orderId: id() }), msg(1));

	const calls = publishMock().mock.calls.filter(
		(c: any[]) => c[0] === Subjects.WishlistAvailable,
	);
	expect(calls.length).toBe(0);
	const ref = await TicketRef.findById(ticketId);
	expect(ref!.available).toBe(false);
});

it('does NOT re-alert available when an already-available listing is edited', async () => {
	const ticketId = id();
	const sellerId = await seed(ticketId, 100, 2); // available
	const listener = new TicketUpdatedListener(natsWrapper.connection);

	// A plain edit (still listed, still free) — no availability transition.
	await listener.onMessage(evt(ticketId, sellerId, { price: 100, version: 1, title: 'Renamed' }), msg(1));

	const calls = publishMock().mock.calls.filter(
		(c: any[]) => c[0] === Subjects.WishlistAvailable,
	);
	expect(calls.length).toBe(0);
});
