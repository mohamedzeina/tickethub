import mongoose from 'mongoose';
import { updateIfCurrentPlugin } from 'mongoose-update-if-current';
import { OrderStatus } from '@zeina-tickethub/common';
import { TicketDoc } from './ticket';

export { OrderStatus };

interface OrderAttrs {
	userId: string;
	userEmail?: string;
	status: OrderStatus;
	expiresAt: Date;
	ticket: TicketDoc;
}

interface OrderDoc extends mongoose.Document {
	userId: string;
	// Buyer's email, kept so expiry/cancel notifications can reach them (#5b/5c).
	userEmail?: string;
	version: number;
	status: OrderStatus;
	expiresAt: Date;
	ticket: TicketDoc;
	// Receipt metadata, set when payment:created completes the order (C5).
	stripeId?: string;
	paidAt?: Date;
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
		stripeId: {
			type: String,
		},
		paidAt: {
			type: mongoose.Schema.Types.Date,
		},
	},
	{
		toJSON: {
			transform(doc: OrderDoc, ret: OrderJSON) {
				ret.id = ret._id?.toString();
				delete ret._id;
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
