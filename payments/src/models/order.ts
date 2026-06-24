import mongoose from 'mongoose';
import { OrderStatus } from '@zeina-tickethub/common';
import { updateIfCurrentPlugin } from 'mongoose-update-if-current';

interface OrderAttrs {
	id: string;
	status: OrderStatus;
	version: number;
	userId: string;
	// Per-seat price. The amount charged is price * quantity (#10).
	price: number;
	// Multi-seat (#10): seats in the order. Optional so pre-#10 replays build as 1.
	quantity?: number;
	// Carried on order:created so the webhook can email a receipt. (#5)
	// Optional so replays of pre-#5 events still build.
	userEmail?: string;
	ticketTitle?: string;
}

interface OrderDoc extends mongoose.Document {
	status: OrderStatus;
	version: number;
	userId: string;
	price: number;
	quantity: number;
	userEmail?: string;
	ticketTitle?: string;
}

// Interface for the JSON representation after transformation
interface OrderJSON {
	status: string;
	_id?: mongoose.Types.ObjectId; // Optional for deletion
	price: number;
	userId: string;
	id?: string; // Added during transformation
}

interface OrderModel extends mongoose.Model<OrderDoc> {
	build(attrs: OrderAttrs): OrderDoc;
}

const orderSchema = new mongoose.Schema(
	{
		userId: {
			type: String,
			required: true,
		},
		price: {
			type: Number,
			required: true,
		},
		quantity: {
			type: Number,
			required: true,
			min: 1,
			default: 1,
		},
		status: {
			type: String,
			required: true,
		},
		userEmail: {
			type: String,
			required: false,
		},
		ticketTitle: {
			type: String,
			required: false,
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
	return new Order({
		_id: attrs.id,
		version: attrs.version,
		price: attrs.price,
		quantity: attrs.quantity ?? 1,
		userId: attrs.userId,
		status: attrs.status,
		userEmail: attrs.userEmail,
		ticketTitle: attrs.ticketTitle,
	});
};

const Order = mongoose.model<OrderDoc, OrderModel>('Order', orderSchema);

export { Order };
