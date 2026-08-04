import mongoose from 'mongoose';
import { updateIfCurrentPlugin } from 'mongoose-update-if-current';

export interface TicketAttrs {
	id: string; // Added for event handling
	title: string;
	price: number;
	// Multi-seat (#10): total seats listed. reservedSeats is never set at build
	// time — it starts at 0 and is mutated only by the atomic reserve/release
	// helpers below, deliberately outside the ticket:updated version stream.
	quantity?: number;
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
	// Multi-seat (#10): the seat inventory used to guard reservations. `quantity`
	// is mirrored from the tickets service; `reservedSeats` is owned locally and
	// moved only by reserveSeats/releaseSeats so it never collides with the OCC
	// version that tracks ticket:updated.
	// This is the inverse of the tickets service's `availableQty`
	// (reservedSeats === quantity - availableQty). The ticket:created/:updated
	// listeners therefore drop the event's availableQty on purpose rather than
	// mirroring it — that omission is deliberate, not an oversight.
	quantity: number;
	reservedSeats: number;
	userId?: string;
	eventDate?: Date;
	venue?: string;
	description?: string;
	category?: string;
	imageUrl?: string;
	// Mirrored from the tickets service so we can refuse to reserve a hidden
	// listing.
	unlisted?: boolean;
}
interface TicketModel extends mongoose.Model<TicketDoc> {
	build(attrs: TicketAttrs): TicketDoc;
	findByEvent(event: {
		id: string;
		version: number;
	}): Promise<TicketDoc | null>;
	// Atomically claim `seats` seats iff enough remain (reservedSeats + seats <=
	// quantity). Returns the updated doc, or null when capacity is insufficient or
	// the ticket is gone. The condition + increment run in one Mongo op, so
	// concurrent buyers can't oversell. Bypasses the OCC version on purpose.
	reserveSeats(ticketId: string, seats: number): Promise<TicketDoc | null>;
	// Return `seats` to the pool when an order leaves a seat-holding state. Guarded
	// so a stray double-release can't push reservedSeats below 0.
	releaseSeats(ticketId: string, seats: number): Promise<TicketDoc | null>;
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
		quantity: {
			type: Number,
			required: true,
			min: 1,
			default: 1,
		},
		reservedSeats: {
			type: Number,
			required: true,
			min: 0,
			default: 0,
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
		quantity: attrs.quantity ?? 1,
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

ticketSchema.statics.reserveSeats = (ticketId: string, seats: number) => {
	// Single-document conditional update: the seats are claimed only if the listing
	// still has room, atomically. Returns null when oversold or the ticket is gone.
	return Ticket.findOneAndUpdate(
		{
			_id: ticketId,
			unlisted: { $ne: true },
			$expr: { $lte: [{ $add: ['$reservedSeats', seats] }, '$quantity'] },
		},
		{ $inc: { reservedSeats: seats } },
		{ new: true },
	);
};

ticketSchema.statics.releaseSeats = (ticketId: string, seats: number) => {
	// Only release when at least `seats` are actually held, so a duplicate release
	// (e.g. cancel racing expiration) can't drive reservedSeats negative.
	return Ticket.findOneAndUpdate(
		{ _id: ticketId, reservedSeats: { $gte: seats } },
		{ $inc: { reservedSeats: -seats } },
		{ new: true },
	);
};

const Ticket = mongoose.model<TicketDoc, TicketModel>('Ticket', ticketSchema);
export { Ticket };
