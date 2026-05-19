import mongoose from 'mongoose';
import { Order, OrderStatus } from './order';

interface TicketAttrs {
	id: string; // Added for event handling
	title: string;
	price: number;
}
export interface TicketDoc extends mongoose.Document {
	id: string; // Added for event handling
	title: string;
	price: number;
	isReserved(): Promise<boolean>;
}
interface TicketModel extends mongoose.Model<TicketDoc> {
	build(attrs: TicketAttrs): TicketDoc;
}

interface TicketJSON {
	title: string;
	price: number;
	_id?: mongoose.Types.ObjectId; // Optional for deletion
	id?: string; // Added during transformation
}

const ticketSchema = new mongoose.Schema(
	{
		title: {
			type: String,
			required: true,
		},
		price: {
			type: Number,
			required: true,
			min: 0,
		},
	},
	{
		toJSON: {
			transform(doc: TicketDoc, ret: TicketJSON) {
				ret.id = ret._id?.toString();
				delete ret._id;
			},
		},
	},
);

ticketSchema.statics.build = (attrs: TicketAttrs) => {
	return new Ticket({
		_id: attrs.id,
		title: attrs.title,
		price: attrs.price,
	});
};

ticketSchema.methods.isReserved = async function () {
	const existingOrder = await Order.findOne({
		ticket: this,
		status: {
			$in: [
				OrderStatus.Created,
				OrderStatus.AwaitingPayment,
				OrderStatus.Complete,
			],
		},
	});
	return !!existingOrder;
};

const Ticket = mongoose.model<TicketDoc, TicketModel>('Ticket', ticketSchema);
export { Ticket };
