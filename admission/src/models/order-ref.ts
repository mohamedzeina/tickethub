import mongoose from 'mongoose';
import { OrderStatus } from '@zeina-tickethub/common';

// Local read-model replica of an order, seeded from `order:created`. Admission
// needs it to know WHO an order belongs to (buyerId) and WHICH ticket, so that
// when `payment:created` arrives (carrying only an orderId) it can mint a pass
// for the right buyer/event without a cross-service lookup.
//
// Keyed on `_id = orderId`. No version plugin: each status transition arrives on
// a distinct event guarded by `processOnce`, and Complete is terminal here.

interface OrderRefAttrs {
	id: string;
	buyerId: string;
	ticketId: string;
	ticketTitle: string;
	status: OrderStatus;
	// Multi-seat (#10): seats in the order, so payment:created mints one pass per
	// seat. Optional so a pre-#10 order:created replay builds as a single seat.
	quantity?: number;
}

interface OrderRefDoc extends mongoose.Document {
	buyerId: string;
	ticketId: string;
	ticketTitle: string;
	status: OrderStatus;
	quantity: number;
}

interface OrderRefModel extends mongoose.Model<OrderRefDoc> {
	build(attrs: OrderRefAttrs): OrderRefDoc;
}

const orderRefSchema = new mongoose.Schema<OrderRefDoc>(
	{
		buyerId: { type: String, required: true },
		ticketId: { type: String, required: true },
		ticketTitle: { type: String, required: true },
		status: { type: String, required: true },
		quantity: { type: Number, required: true, default: 1, min: 1 },
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

orderRefSchema.statics.build = (attrs: OrderRefAttrs) => {
	return new OrderRef({
		_id: attrs.id,
		buyerId: attrs.buyerId,
		ticketId: attrs.ticketId,
		ticketTitle: attrs.ticketTitle,
		status: attrs.status,
		quantity: attrs.quantity ?? 1,
	});
};

const OrderRef = mongoose.model<OrderRefDoc, OrderRefModel>(
	'OrderRef',
	orderRefSchema,
);

export { OrderRef };
