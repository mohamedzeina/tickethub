import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { OrderStatus } from '@zeina-tickethub/common';
import { OrderRef } from '../models/order-ref';
import { Review } from '../models/review';

// A fresh id in the shape every cross-service id here has: a 24-hex string.
export const id = () => new mongoose.Types.ObjectId().toHexString();

// The only parts of a JetStream message the listeners touch.
export const msg = (seq: number) =>
	({ ack: jest.fn(), seq }) as unknown as JsMsg;

// Seed a local order replica the way the listeners would, so the routes have
// something to authorize against.
export const seedOrder = async (overrides: any = {}) => {
	const order = OrderRef.build({
		id: overrides.id || id(),
		buyerId: overrides.buyerId || id(),
		sellerId: overrides.sellerId || id(),
		ticketId: overrides.ticketId || id(),
		ticketTitle: overrides.ticketTitle || 'Coldplay',
		status: overrides.status || OrderStatus.Complete,
	});
	await order.save();
	return order;
};

// Seed a review. `hidden` is set post-hoc on refund (Option A), not at build
// time, so the factory mirrors that.
export const seedReview = async (overrides: any = {}) => {
	const review = Review.build({
		orderId: overrides.orderId || id(),
		sellerId: overrides.sellerId || id(),
		buyerId: overrides.buyerId || id(),
		ticketTitle: overrides.ticketTitle || 'Coldplay',
		rating: overrides.rating ?? 5,
	});
	if (overrides.hidden) review.set({ hidden: true });
	await review.save();
	return review;
};
