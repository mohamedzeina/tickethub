import mongoose from 'mongoose';
import { OrderStatus } from '@zeina-tickethub/common';

// Local read-model replica of an order, seeded from `order:created` (the only
// event that carries the buyer's userId + ticket title). The downstream
// payment/expiration events only carry an orderId, so notifications looks the
// order up here to know *whose* feed to write to, and tracks `status` so an
// already-paid order doesn't get an "expiring soon"/"released" notification.
//
// Keyed on `_id = orderId` for direct findById. No optimistic-version plugin:
// each status transition arrives on a distinct event guarded by `processOnce`,
// so there's no concurrent in-place update of the same field to race.

interface OrderAttrs {
	id: string;
	userId: string;
	ticketTitle: string;
	status: OrderStatus;
	// Carried from order:created so this service can send the transactional
	// emails (receipt / expiry) without a separate user or ticket lookup.
	// Optional so a replay of any pre-email order:created still builds.
	userEmail?: string;
	price?: number;
}

interface OrderDoc extends mongoose.Document {
	userId: string;
	ticketTitle: string;
	status: OrderStatus;
	userEmail?: string;
	price?: number;
}

interface OrderModel extends mongoose.Model<OrderDoc> {
	build(attrs: OrderAttrs): OrderDoc;
}

const orderSchema = new mongoose.Schema<OrderDoc>(
	{
		userId: { type: String, required: true },
		ticketTitle: { type: String, required: true },
		status: { type: String, required: true },
		userEmail: { type: String, required: false },
		price: { type: Number, required: false },
	},
	{
		toJSON: {
			transform(doc, ret: any) {
				ret.id = ret._id?.toString();
				delete ret._id;
				delete ret.__v;
			},
		},
	},
);

orderSchema.statics.build = (attrs: OrderAttrs) => {
	return new Order({
		_id: attrs.id,
		userId: attrs.userId,
		ticketTitle: attrs.ticketTitle,
		status: attrs.status,
		userEmail: attrs.userEmail,
		price: attrs.price,
	});
};

const Order = mongoose.model<OrderDoc, OrderModel>('Order', orderSchema);

export { Order };
