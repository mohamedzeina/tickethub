import mongoose from 'mongoose';

// #11 payouts — a seller's share of one sale. Created when orders signals the
// order has cleared its refund window (order:payout:due). One per order (unique
// orderId), so a redelivered event / sweep retry can't double-pay.
//
// status:
//   paid            — transfer created on Stripe (transferId set)
//   pending_account — seller hasn't finished Connect onboarding; the money is
//                     HELD on the platform and released when they connect
//   failed          — the transfer attempt errored (kept for visibility/retry)
export type PayoutStatus = 'paid' | 'pending_account' | 'failed';

interface PayoutAttrs {
	orderId: string;
	sellerId: string;
	amount: number; // gross sale price in dollars
	fee: number; // platform fee in dollars
	stripeAccountId?: string;
	transferId?: string;
	chargeId?: string;
	status?: PayoutStatus;
}

interface PayoutDoc extends mongoose.Document {
	orderId: string;
	sellerId: string;
	amount: number;
	fee: number;
	stripeAccountId?: string;
	transferId?: string;
	chargeId?: string;
	status: PayoutStatus;
}

interface PayoutModel extends mongoose.Model<PayoutDoc> {
	build(attrs: PayoutAttrs): PayoutDoc;
}

const payoutSchema = new mongoose.Schema<PayoutDoc>(
	{
		orderId: { type: String, required: true, unique: true },
		sellerId: { type: String, required: true },
		amount: { type: Number, required: true },
		fee: { type: Number, required: true },
		stripeAccountId: { type: String },
		transferId: { type: String },
		chargeId: { type: String },
		status: {
			type: String,
			required: true,
			default: 'pending_account',
			enum: ['paid', 'pending_account', 'failed'],
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

payoutSchema.statics.build = (attrs: PayoutAttrs) => new Payout(attrs);

const Payout = mongoose.model<PayoutDoc, PayoutModel>('Payout', payoutSchema);

export { Payout, PayoutDoc };
