import mongoose from 'mongoose';

// Local read-model replica of a ticket, seeded from `ticket:created` and kept
// fresh by `ticket:updated`. Two jobs: (1) supply current details (title, price,
// image, date) when rendering a user's saved list without a cross-service call,
// and (2) hold the last-known `price` so the updated-listener can detect a DROP
// (new price < stored price) and alert watchers.
//
// `version` is the ticket's optimistic-concurrency version; we only apply an
// update whose version is newer than what we hold, so out-of-order / replayed
// events can't fabricate a phantom price change. Keyed on `_id = ticketId`.

interface TicketRefAttrs {
	id: string;
	title: string;
	price: number;
	version: number;
	sellerId: string;
	unlisted?: boolean;
	eventDate?: string;
	venue?: string;
	imageUrl?: string;
	category?: string;
}

interface TicketRefDoc extends mongoose.Document {
	title: string;
	price: number;
	version: number;
	sellerId: string;
	unlisted: boolean;
	eventDate?: string;
	venue?: string;
	imageUrl?: string;
	category?: string;
}

interface TicketRefModel extends mongoose.Model<TicketRefDoc> {
	build(attrs: TicketRefAttrs): TicketRefDoc;
}

const ticketRefSchema = new mongoose.Schema<TicketRefDoc>(
	{
		title: { type: String, required: true },
		price: { type: Number, required: true },
		version: { type: Number, required: true, default: 0 },
		sellerId: { type: String, required: true },
		unlisted: { type: Boolean, required: true, default: false },
		eventDate: { type: String, required: false },
		venue: { type: String, required: false },
		imageUrl: { type: String, required: false },
		category: { type: String, required: false },
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

ticketRefSchema.statics.build = (attrs: TicketRefAttrs) => {
	return new TicketRef({
		_id: attrs.id,
		title: attrs.title,
		price: attrs.price,
		version: attrs.version,
		sellerId: attrs.sellerId,
		unlisted: attrs.unlisted ?? false,
		eventDate: attrs.eventDate,
		venue: attrs.venue,
		imageUrl: attrs.imageUrl,
		category: attrs.category,
	});
};

const TicketRef = mongoose.model<TicketRefDoc, TicketRefModel>(
	'TicketRef',
	ticketRefSchema,
);

export { TicketRef };
