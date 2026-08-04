import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { OrderStatus } from '@zeina-tickethub/common';
import { Ticket, TicketAttrs, TicketDoc } from '../models/ticket';
import { Order, OrderDoc } from '../models/order';

// A fresh Mongo id as a hex string — cross-service ids are Strings here, so this
// is the shape every userId / ticketId / orderId in a test wants.
export const oid = () => new mongoose.Types.ObjectId().toHexString();

// A stand-in for a JetStream message. Listeners only ever touch ack() and seq,
// so a double cast is enough — and honest, unlike a @ts-ignore'd object literal
// that claims to be a full JsMsg.
export const fakeMsg = (seq = 1) =>
	({ ack: jest.fn(), seq }) as unknown as JsMsg;

// A saved ticket replica. The defaults are the fixture these tests have always
// used, so callers spell out only the field under test.
export const buildTicket = async (
	overrides: Partial<TicketAttrs> = {},
): Promise<TicketDoc> => {
	const ticket = Ticket.build({
		id: oid(),
		title: 'Akon Concert',
		price: 50,
		...overrides,
	});
	await ticket.save();
	return ticket;
};

// A saved, Complete + paid order — i.e. a real sale. Anything outside the
// Order.build attrs (paidAt, redeemedAt, refundRequestedAt, payoutDueAt, …) is
// stamped afterwards via set(), matching how the routes/listeners write them.
// Pass `ticket` to attach an existing listing, otherwise one is built for you.
export const buildPaidOrder = async ({
	ticket,
	userId = oid(),
	status = OrderStatus.Complete,
	quantity,
	...stamps
}: {
	ticket?: TicketDoc;
	userId?: string;
	status?: OrderStatus;
	quantity?: number;
	[stamp: string]: unknown;
} = {}): Promise<OrderDoc> => {
	const listing = ticket ?? (await buildTicket());

	const order = Order.build({
		userId,
		status,
		expiresAt: new Date(),
		ticket: listing,
		...(quantity != null ? { quantity } : {}),
	});
	order.set({ paidAt: new Date(), ...stamps });
	await order.save();
	return order;
};
