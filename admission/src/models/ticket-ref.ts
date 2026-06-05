import mongoose from 'mongoose';

// Local read-model replica of a ticket, seeded from `ticket:created`/`updated`.
// Admission uses it only to enrich a pass with the event's venue + date for the
// gate display. Keyed on `_id = ticketId`. Latest-wins on update — these fields
// are cosmetic, so a rare out-of-order update is acceptable (no version plugin).

interface TicketRefAttrs {
	id: string;
	title: string;
	venue?: string;
	eventDate?: Date | string;
}

interface TicketRefDoc extends mongoose.Document {
	title: string;
	venue?: string;
	eventDate?: Date;
}

interface TicketRefModel extends mongoose.Model<TicketRefDoc> {
	build(attrs: TicketRefAttrs): TicketRefDoc;
}

const ticketRefSchema = new mongoose.Schema<TicketRefDoc>(
	{
		title: { type: String, required: true },
		venue: { type: String, required: false },
		eventDate: { type: mongoose.Schema.Types.Date, required: false },
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
		venue: attrs.venue,
		eventDate: attrs.eventDate,
	});
};

const TicketRef = mongoose.model<TicketRefDoc, TicketRefModel>(
	'TicketRef',
	ticketRefSchema,
);

export { TicketRef };
