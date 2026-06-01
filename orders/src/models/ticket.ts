import mongoose from 'mongoose';
import { updateIfCurrentPlugin } from 'mongoose-update-if-current';
import { Order, OrderStatus } from './order';

interface TicketAttrs {
	id: string; // Added for event handling
	title: string;
	price: number;
	// Owner of the listing — used to stop a user buying their own ticket.
	// Optional so tickets replicated before this field stay valid.
	userId?: string;
	eventDate?: string;
	venue?: string;
	description?: string;
	category?: string;
	imageUrl?: string;
	unlisted?: boolean;
}
export interface TicketDoc extends mongoose.Document {
	id: string; // Added for event handling
	version: number;
	title: string;
	price: number;
	userId?: string;
	eventDate?: Date;
	venue?: string;
	description?: string;
	category?: string;
	imageUrl?: string;
	// Mirrored from the tickets service so we can refuse to reserve a hidden
	// listing.
	unlisted?: boolean;
	isReserved(): Promise<boolean>;
}
interface TicketModel extends mongoose.Model<TicketDoc> {
	build(attrs: TicketAttrs): TicketDoc;
	findByEvent(event: {
		id: string;
		version: number;
	}): Promise<TicketDoc | null>;
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
		userId: {
			type: String,
		},
		eventDate: {
			type: mongoose.Schema.Types.Date,
		},
		venue: {
			type: String,
		},
		description: {
			type: String,
		},
		category: {
			type: String,
		},
		imageUrl: {
			type: String,
		},
		unlisted: {
			type: Boolean,
			default: false,
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

ticketSchema.set('versionKey', 'version');
ticketSchema.plugin(updateIfCurrentPlugin);

ticketSchema.statics.build = (attrs: TicketAttrs) => {
	return new Ticket({
		_id: attrs.id,
		title: attrs.title,
		price: attrs.price,
		userId: attrs.userId,
		unlisted: attrs.unlisted,
		eventDate: attrs.eventDate,
		venue: attrs.venue,
		description: attrs.description,
		category: attrs.category,
		imageUrl: attrs.imageUrl,
	});
};

ticketSchema.statics.findByEvent = (event: { id: string; version: number }) => {
	return Ticket.findOne({
		_id: event.id,
		version: event.version - 1,
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
