import mongoose from 'mongoose';
import { updateIfCurrentPlugin } from 'mongoose-update-if-current';
import { OrderStatus } from '@zeina-tickethub/common';
import { TicketDoc } from './ticket';
import { refundableUntil, isRefundable } from '../services/refund-window';

export { OrderStatus };

interface OrderAttrs {
	userId: string;
	userEmail?: string;
	status: OrderStatus;
	expiresAt: Date;
	ticket: TicketDoc;
	// Multi-seat (#10): seats reserved by this order. The order total is
	// ticket.price * quantity. Defaults to 1 for single-unit orders.
	quantity?: number;
}

export interface OrderDoc extends mongoose.Document {
	userId: string;
	// Buyer's email, kept so expiry/cancel notifications can reach them (#5b/5c).
	userEmail?: string;
	version: number;
	status: OrderStatus;
	expiresAt: Date;
	ticket: TicketDoc;
	// Multi-seat (#10): seats reserved by this order (>= 1).
	quantity: number;
	// Receipt metadata, set when payment:created completes the order (C5).
	stripeId?: string;
	paidAt?: Date;
	// Refund (#6 tail). refundRequestedAt is set the moment a buyer asks; the
	// rest are stamped when the Stripe webhook confirms the refund settled and
	// the status flips to Refunded.
	refundRequestedAt?: Date;
	refundedAt?: Date;
	refundAmount?: number;
	stripeRefundId?: string;
	// Set when the admission pass is scanned (ticket:redeemed) — a redeemed order
	// can no longer be refunded.
	redeemedAt?: Date;
	// #11 payouts. Stamped once the payout sweep has emitted order:payout:due for
	// this order, so it fires exactly once per order (payments is also idempotent
	// per orderId as the ultimate guard).
	payoutDueAt?: Date;
}

interface OrderModel extends mongoose.Model<OrderDoc> {
	build(attrs: OrderAttrs): OrderDoc;
}

interface OrderJSON {
	userId: string;
	status: OrderStatus;
	expiresAt?: Date | null;
	ticket?: mongoose.Types.ObjectId | null;
	stripeId?: string | null;
	paidAt?: Date | null;
	_id?: mongoose.Types.ObjectId; // Optional for deletion
	id?: string; // Added during transformation
}

const orderSchema = new mongoose.Schema(
	{
		userId: {
			type: String,
			required: true,
		},
		userEmail: {
			type: String,
		},
		status: {
			type: String,
			required: true,
			enum: Object.values(OrderStatus),
			default: OrderStatus.Created,
		},
		expiresAt: {
			type: mongoose.Schema.Types.Date,
		},
		ticket: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Ticket',
		},
		quantity: {
			type: Number,
			required: true,
			min: 1,
			default: 1,
		},
		stripeId: {
			type: String,
		},
		paidAt: {
			type: mongoose.Schema.Types.Date,
		},
		refundRequestedAt: {
			type: mongoose.Schema.Types.Date,
		},
		refundedAt: {
			type: mongoose.Schema.Types.Date,
		},
		refundAmount: {
			type: Number,
		},
		stripeRefundId: {
			type: String,
		},
		redeemedAt: {
			type: mongoose.Schema.Types.Date,
		},
		payoutDueAt: {
			type: mongoose.Schema.Types.Date,
		},
	},
	{
		toJSON: {
			transform(doc: OrderDoc, ret: any) {
				ret.id = ret._id?.toString();
				delete ret._id;
				// Surface the refund policy so the client can show / gate the
				// "Request refund" button without re-deriving the rules.
				ret.refundableUntil = refundableUntil(doc);
				ret.refundable = isRefundable(doc);
			},
		},
	},
);

orderSchema.set('versionKey', 'version');
orderSchema.plugin(updateIfCurrentPlugin);

orderSchema.statics.build = (attrs: OrderAttrs) => {
	return new Order(attrs);
};

const Order = mongoose.model<OrderDoc, OrderModel>('Order', orderSchema);
export { Order };
