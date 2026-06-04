import mongoose from 'mongoose';

// Local read-model replica of a ticket, seeded from `ticket:created`. The ONLY
// purpose is to learn the ticket -> seller (userId) mapping, because neither
// `order:created` nor `payment:created` carries the seller's id. Keyed on
// `_id = ticketId` for direct findById at order-replication time.
//
// No version plugin: sellerId is immutable and the title is cosmetic, so a rare
// out-of-order title update is acceptable — we just upsert latest-wins.

interface TicketRefAttrs {
	id: string;
	sellerId: string;
	title: string;
}

interface TicketRefDoc extends mongoose.Document {
	sellerId: string;
	title: string;
}

interface TicketRefModel extends mongoose.Model<TicketRefDoc> {
	build(attrs: TicketRefAttrs): TicketRefDoc;
}

const ticketRefSchema = new mongoose.Schema<TicketRefDoc>(
	{
		sellerId: { type: String, required: true },
		title: { type: String, required: true },
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
		sellerId: attrs.sellerId,
		title: attrs.title,
	});
};

const TicketRef = mongoose.model<TicketRefDoc, TicketRefModel>(
	'TicketRef',
	ticketRefSchema,
);

export { TicketRef };
