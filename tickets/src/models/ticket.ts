import mongoose from 'mongoose';
import { updateIfCurrentPlugin } from 'mongoose-update-if-current';

// Allowed listing categories (also reused for route validation).
export const TICKET_CATEGORIES = [
	'Concerts',
	'Sports',
	'Theater',
	'Festivals',
	'Other',
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

interface TicketAttrs {
	title: string;
	price: number;
	userId: string;
	// Multi-seat (#10): total seats listed and how many are still on sale. Optional
	// in the type so legacy Ticket.build(...) calls default to a single seat.
	quantity?: number;
	availableQty?: number;
	// Required by the create/update routes at runtime, but kept optional in the
	// type so direct Ticket.build(...) calls (tests, event replicas) stay valid.
	eventDate?: Date;
	venue?: string;
	description?: string;
	category?: TicketCategory;
	imageUrl?: string;
	unlisted?: boolean;
}

interface TicketDoc extends mongoose.Document {
	title: string;
	price: number;
	userId: string;
	version: number;
	orderId?: string;
	// Multi-seat (#10): the listing's seat inventory. `quantity` is the immutable
	// total the seller listed; `availableQty` falls as buyers reserve seats and
	// rises again when those reservations are released. availableQty > 0 means the
	// listing is still buyable; availableQty === 0 means sold out.
	quantity: number;
	availableQty: number;
	eventDate?: Date;
	venue?: string;
	description?: string;
	category?: TicketCategory;
	imageUrl?: string;
	// Soft-delete flag: a seller can hide a listing from the marketplace without
	// destroying it, keeping the orders/payments ticket replicas consistent.
	unlisted?: boolean;
}

// Interface for the JSON representation after transformation
interface TicketJSON {
	title: string;
	_id?: mongoose.Types.ObjectId; // Optional for deletion
	price: number;
	userId: string;
	id?: string; // Added during transformation
	orderId?: string | null;
}

interface TicketModel extends mongoose.Model<TicketDoc> {
	build(attrs: TicketAttrs): TicketDoc;
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
		},
		userId: {
			type: String,
			required: true,
		},
		orderId: {
			type: String,
		},
		quantity: {
			type: Number,
			required: true,
			min: 1,
			default: 1,
		},
		availableQty: {
			type: Number,
			required: true,
			min: 0,
			// New listings start fully available; falls back to 1 for legacy docs.
			default: function (this: { quantity?: number }) {
				return this.quantity ?? 1;
			},
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
			enum: TICKET_CATEGORIES,
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

ticketSchema.statics.build = (attr: TicketAttrs) => {
	return new Ticket(attr);
};

const Ticket = mongoose.model<TicketDoc, TicketModel>('Ticket', ticketSchema);

export { Ticket };
