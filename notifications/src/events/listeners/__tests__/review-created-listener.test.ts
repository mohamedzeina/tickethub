import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { ReviewCreatedEvent } from '@zeina-tickethub/common';
import { ReviewCreatedListener } from '../review-created-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Notification, NotificationType } from '../../../models/notification';

const id = () => new mongoose.Types.ObjectId().toHexString();
const msg = (seq: number) => ({ ack: jest.fn(), seq }) as unknown as JsMsg;

const data = (over: Partial<ReviewCreatedEvent['data']> = {}): ReviewCreatedEvent['data'] => ({
	reviewId: id(),
	sellerId: id(),
	buyerId: id(),
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

it('is idempotent on redelivery', async () => {
	const listener = new ReviewCreatedListener(natsWrapper.connection);
	const d = data();

	await listener.onMessage(d, msg(3));
	await listener.onMessage(d, msg(3));

	expect(await Notification.countDocuments({ userId: d.sellerId })).toBe(1);
});
