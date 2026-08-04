import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { TicketRef } from '../models/ticket-ref';
import { Wishlist } from '../models/wishlist';

// A fresh id in the shape every cross-service id here has: a 24-hex string.
export const id = () => new mongoose.Types.ObjectId().toHexString();

// The only parts of a JetStream message the listeners touch.
export const msg = (seq: number) =>
	({ ack: jest.fn(), seq }) as unknown as JsMsg;

// Seed the local ticket replica the way `ticket:created` would. Returns the
// ticket id, which is what callers wishlist against.
export const seedTicket = async (overrides: any = {}) => {
	const ticketId = overrides.id || id();
	await TicketRef.build({
		id: ticketId,
		title: 'Coldplay',
		price: 100,
		version: 0,
		sellerId: id(),
		...overrides,
	}).save();
	return ticketId;
};

// Park N watchers on a ticket, each with their own captured email.
export const seedWatchers = async (ticketId: string, watchers: number) => {
	for (let i = 0; i < watchers; i++) {
		await Wishlist.build({
			userId: id(),
			ticketId,
			userEmail: `watcher${i}@test.com`,
		}).save();
	}
};
