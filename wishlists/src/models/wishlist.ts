import mongoose from 'mongoose';

// One row per (user, ticket) the user has saved. The unique compound index is
// the dedupe guard — saving the same listing twice is a harmless no-op. We store
// only the ids; current ticket details (title/price) are joined from the
// TicketRef replica at read time, so a rename/price change is always reflected.

interface WishlistAttrs {
	userId: string;
	ticketId: string;
	userEmail?: string;
}

interface WishlistDoc extends mongoose.Document {
	userId: string;
	ticketId: string;
	// Captured from the watcher's JWT at save time so a price-drop alert can be
	// emailed without a cross-service user lookup. Refreshed on every save.
	userEmail?: string;
	createdAt: string;
	updatedAt: string;
}

interface WishlistModel extends mongoose.Model<WishlistDoc> {
	build(attrs: WishlistAttrs): WishlistDoc;
}

const wishlistSchema = new mongoose.Schema<WishlistDoc>(
	{
		userId: { type: String, required: true },
		ticketId: { type: String, required: true },
		userEmail: { type: String, required: false },
	},
	{
		timestamps: true,
		toJSON: {
			transform(doc, ret: any) {
				ret.id = ret._id?.toString();
				delete ret._id;
				delete ret.__v;
			},
		},
	},
);

// One save per (user, ticket); also the lookup index for a user's list.
wishlistSchema.index({ userId: 1, ticketId: 1 }, { unique: true });
// Reverse lookup: who watches a given ticket (price-drop fan-out).
wishlistSchema.index({ ticketId: 1 });

wishlistSchema.statics.build = (attrs: WishlistAttrs) => {
	return new Wishlist(attrs);
};

const Wishlist = mongoose.model<WishlistDoc, WishlistModel>(
	'Wishlist',
	wishlistSchema,
);

export { Wishlist };
