import mongoose from 'mongoose';
import { OrderStatus } from '@zeina-tickethub/common';

// Local read-model replica of an order — the authorization record for reviews.
// Seeded from `order:created` (buyer + ticket), with sellerId resolved from the
// TicketRef at that time so a review request needs a single lookup. `status`
// advances to Complete on `payment:created` and Cancelled on `order:cancelled`;
// only a Complete order is reviewable, and only by its buyer.
//
// Keyed on `_id = orderId`. No version plugin: each status transition arrives on
// a distinct event guarded by `processOnce`, and Complete/Cancelled are terminal.

interface OrderRefAttrs {
	id: string;
	buyerId: string;
	sellerId: string;
	ticketId: string;
	ticketTitle: string;
	status: OrderStatus;
}

interface OrderRefDoc extends mongoose.Document {
	buyerId: string;
	sellerId: string;
	ticketId: string;
	ticketTitle: string;
	status: OrderStatus;
}

interface OrderRefModel extends mongoose.Model<OrderRefDoc> {
	build(attrs: OrderRefAttrs): OrderRefDoc;
}

const orderRefSchema = new mongoose.Schema<OrderRefDoc>(
	{
		buyerId: { type: String, required: true },
		sellerId: { type: String, required: true },
		ticketId: { type: String, required: true },
		ticketTitle: { type: String, required: true },
		status: { type: String, required: true },
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
		sellerId: attrs.sellerId,
		ticketId: attrs.ticketId,
		ticketTitle: attrs.ticketTitle,
		status: attrs.status,
	});
};

const OrderRef = mongoose.model<OrderRefDoc, OrderRefModel>(
	'OrderRef',
	orderRefSchema,
);

export { OrderRef };
