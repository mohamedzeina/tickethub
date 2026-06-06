import mongoose from 'mongoose';
import { JsMsg } from 'nats';

jest.mock('@zeina-tickethub/common', () => ({
	...jest.requireActual('@zeina-tickethub/common'),
	sendMail: jest.fn(),
}));

import { WishlistAvailableEvent, sendMail } from '@zeina-tickethub/common';
import { WishlistAvailableListener } from '../wishlist-available-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Notification, NotificationType } from '../../../models/notification';

const id = () => new mongoose.Types.ObjectId().toHexString();
const msg = (seq: number) => ({ ack: jest.fn(), seq }) as unknown as JsMsg;

const data = (over: Partial<WishlistAvailableEvent['data']> = {}): WishlistAvailableEvent['data'] => ({
	userId: id(),
	email: 'watcher@test.com',
	ticketId: id(),
	title: 'Coldplay',
	price: 90,
	...over,
});

beforeEach(() => (sendMail as jest.Mock).mockClear());

it('writes an in-app "back on sale" notification linked to the ticket', async () => {
	const listener = new WishlistAvailableListener(natsWrapper.connection);
	const d = data();

	await listener.onMessage(d, msg(1));

	const notes = await Notification.find({ userId: d.userId });
	expect(notes.length).toBe(1);
	expect(notes[0].type).toBe(NotificationType.WishlistAvailable);
	expect(notes[0].ticketId).toBe(d.ticketId);
});

it('emails the watcher when an address is present', async () => {
	const listener = new WishlistAvailableListener(natsWrapper.connection);
	await listener.onMessage(data(), msg(1));

	expect(sendMail as jest.Mock).toHaveBeenCalledTimes(1);
	expect((sendMail as jest.Mock).mock.calls[0][0].to).toBe('watcher@test.com');
});

it('is idempotent on redelivery', async () => {
	const listener = new WishlistAvailableListener(natsWrapper.connection);
	const d = data();

	await listener.onMessage(d, msg(5));
	await listener.onMessage(d, msg(5));

	expect(await Notification.countDocuments({ userId: d.userId })).toBe(1);
});
