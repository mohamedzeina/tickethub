import { ReviewCreatedEvent } from '@zeina-tickethub/common';
import { ReviewCreatedListener } from '../review-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Notification, NotificationType } from '../../../models/notification';
import { msg, oid } from '../../../test/helpers';

const data = (over: Partial<ReviewCreatedEvent['data']> = {}): ReviewCreatedEvent['data'] => ({
	reviewId: oid(),
	sellerId: oid(),
	buyerId: oid(),
	ticketTitle: 'Coldplay',
	rating: 5,
	...over,
});

it('notifies the SELLER that they received a review', async () => {
	const listener = new ReviewCreatedListener(natsWrapper.connection);
	const d = data();

	await listener.onMessage(d, msg(1));

	const notes = await Notification.find({ userId: d.sellerId });
	expect(notes.length).toBe(1);
	expect(notes[0].type).toBe(NotificationType.ReviewReceived);
	// Buyer must not be notified.
	expect(await Notification.countDocuments({ userId: d.buyerId })).toBe(0);
});

// `stars` is module-private, so the clamp is asserted through the body it
// renders. A rating outside 1–5 can only reach here from a bad or replayed
// payload — it must still render five glyphs, and a negative one must not throw
// out of String.repeat and send the event to redelivery/dead-letter.
it.each([9, -1])('renders exactly five star glyphs for rating %p', async (rating) => {
	const listener = new ReviewCreatedListener(natsWrapper.connection);
	const d = data({ rating });

	await expect(listener.onMessage(d, msg(5))).resolves.toBeUndefined();

	const note = (await Notification.findOne({ userId: d.sellerId }))!;
	expect(note.body.match(/[★☆]/g)!.length).toBe(5);
});

it('is idempotent on redelivery', async () => {
	const listener = new ReviewCreatedListener(natsWrapper.connection);
	const d = data();

	await listener.onMessage(d, msg(3));
	await listener.onMessage(d, msg(3));

	expect(await Notification.countDocuments({ userId: d.sellerId })).toBe(1);
});
