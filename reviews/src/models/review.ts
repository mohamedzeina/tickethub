import mongoose from 'mongoose';

// A buyer's review of a seller for one completed order. One review per order
// (unique index), authored by the buyer, targeting the seller. `ticketTitle` is
// denormalized from the order so the seller-profile listing reads without a
// join. `rating` is 1–5; `comment` is optional.

interface ReviewAttrs {
	orderId: string;
	sellerId: string;
	buyerId: string;
	ticketTitle: string;
	rating: number;
	comment?: string;
}

interface ReviewDoc extends mongoose.Document {
	orderId: string;
	sellerId: string;
	buyerId: string;
	ticketTitle: string;
	rating: number;
	comment?: string;
	// Soft-hidden when the order is refunded (#6 tail, Option A) — a review must
	// reflect a real, kept purchase, so it stops counting toward the seller's
	// reputation. Kept (not deleted) for auditability.
	hidden?: boolean;
	createdAt: string;
	updatedAt: string;
}

interface ReviewModel extends mongoose.Model<ReviewDoc> {
	build(attrs: ReviewAttrs): ReviewDoc;
}

const reviewSchema = new mongoose.Schema<ReviewDoc>(
	{
		orderId: { type: String, required: true },
		sellerId: { type: String, required: true },
		buyerId: { type: String, required: true },
		ticketTitle: { type: String, required: true },
		rating: { type: Number, required: true, min: 1, max: 5 },
		comment: { type: String, required: false },
		hidden: { type: Boolean, required: false, default: false },
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

// One review per order — the dedupe guard at the storage layer.
reviewSchema.index({ orderId: 1 }, { unique: true });
// Seller-profile query: newest reviews for a seller.
reviewSchema.index({ sellerId: 1, createdAt: -1 });

reviewSchema.statics.build = (attrs: ReviewAttrs) => {
	return new Review(attrs);
};

const Review = mongoose.model<ReviewDoc, ReviewModel>('Review', reviewSchema);

export { Review };
