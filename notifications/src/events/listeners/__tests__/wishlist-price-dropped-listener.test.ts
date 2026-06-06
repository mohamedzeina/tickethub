import mongoose from 'mongoose';
import { JsMsg } from 'nats';

// Mock just sendMail; keep the rest of common real.
jest.mock('@zeina-tickethub/common', () => ({
	...jest.requireActual('@zeina-tickethub/common'),
	sendMail: jest.fn(),
}));

import { WishlistPriceDroppedEvent, sendMail } from '@zeina-tickethub/common';
import { WishlistPriceDroppedListener } from '../wishlist-price-dropped-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Notification, NotificationType } from '../../../models/notification';

const id = () => new mongoose.Types.ObjectId().toHexString();
const msg = (seq: number) => ({ ack: jest.fn(), seq }) as unknown as JsMsg;

const data = (over: Partial<WishlistPriceDroppedEvent['data']> = {}): WishlistPriceDroppedEvent['data'] => ({
	userId: id(),
	email: 'watcher@test.com',
	ticketId: id(),
	title: 'Coldplay',
	oldPrice: 100,
	newPrice: 70,
	...over,
});

beforeEach(() => (sendMail as jest.Mock).mockClear());

it('writes an in-app price-drop notification for the watcher (with the ticket link)', async () => {
	const listener = new WishlistPriceDroppedListener(natsWrapper.connection);
	const d = data();

	await listener.onMessage(d, msg(1));

	const notes = await Notification.find({ userId: d.userId });
	expect(notes.length).toBe(1);
	expect(notes[0].type).toBe(NotificationType.PriceDrop);
	expect(notes[0].ticketId).toBe(d.ticketId);
});

it('sends the price-drop email when an address is present', async () => {
	const listener = new WishlistPriceDroppedListener(natsWrapper.connection);
	await listener.onMessage(data({ email: 'watcher@test.com' }), msg(1));

	expect(sendMail as jest.Mock).toHaveBeenCalledTimes(1);
	const arg = (sendMail as jest.Mock).mock.calls[0][0];
	expect(arg.to).toBe('watcher@test.com');
});

it('still writes the in-app note but sends no email when no address is known', async () => {
	const listener = new WishlistPriceDroppedListener(natsWrapper.connection);
	const d = data({ email: undefined });

	await listener.onMessage(d, msg(1));

	expect(await Notification.countDocuments({ userId: d.userId })).toBe(1);
	expect(sendMail as jest.Mock).not.toHaveBeenCalled();
});

it('is idempotent — a redelivered event does not double-notify', async () => {
	const listener = new WishlistPriceDroppedListener(natsWrapper.connection);
	const d = data();

	await listener.onMessage(d, msg(7));
	await listener.onMessage(d, msg(7));

	expect(await Notification.countDocuments({ userId: d.userId })).toBe(1);
});
