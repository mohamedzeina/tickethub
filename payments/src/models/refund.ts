import mongoose from 'mongoose';

// A refund of a paid order's charge. Created (status 'pending') when a refund is
// requested, then flipped to 'succeeded' only when Stripe's charge.refunded
// webhook CONFIRMS the money moved — that confirmation is what publishes
// payment:refunded. One per order (unique orderId), so a redelivered request /
// webhook is idempotent.

export type RefundStatus = 'pending' | 'succeeded' | 'failed';

interface RefundAttrs {
	orderId: string;
	stripeId: string; // the PaymentIntent id being refunded
	refundId?: string; // Stripe refund id (re_...)
	amount?: number; // dollars
	status?: RefundStatus;
}

interface RefundDoc extends mongoose.Document {
	orderId: string;
	stripeId: string;
	refundId?: string;
	amount?: number;
	status: RefundStatus;
}

interface RefundModel extends mongoose.Model<RefundDoc> {
	build(attrs: RefundAttrs): RefundDoc;
}

const refundSchema = new mongoose.Schema<RefundDoc>(
	{
		orderId: { type: String, required: true, unique: true },
		stripeId: { type: String, required: true },
		refundId: { type: String, required: false },
		amount: { type: Number, required: false },
		status: {
			type: String,
			required: true,
			default: 'pending',
			enum: ['pending', 'succeeded', 'failed'],
		},
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

refundSchema.statics.build = (attrs: RefundAttrs) => new Refund(attrs);

const Refund = mongoose.model<RefundDoc, RefundModel>('Refund', refundSchema);

export { Refund };
