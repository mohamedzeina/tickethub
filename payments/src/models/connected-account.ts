import mongoose from 'mongoose';

// #11 Phase 1 — a seller's Stripe Connect (Express) account.
//
// Lives in payments (not auth) because payments owns every Stripe interaction:
// it holds the live STRIPE_KEY + webhook infra, and Phase 2's seller transfer
// happens here, so keeping the seller→acct mapping local avoids a cross-service
// replica. Keyed by userId (a cross-service id, stored as a String like the rest
// of the app). One row per seller (unique userId).
//
// `stripeAccountId` is the `acct_…` id Stripe gives us when we create the Express
// account; onboarding (KYC + bank) happens on Stripe's hosted page. We mirror two
// readiness flags off the Stripe account so the client can show status without a
// round trip to Stripe on every render:
//   - detailsSubmitted: the seller finished the hosted onboarding form
//   - payoutsEnabled:   Stripe has verified them and money can be paid out
// Both are refreshed from Stripe by GET /api/payments/connect/status.

interface ConnectedAccountAttrs {
	userId: string;
	stripeAccountId: string;
	payoutsEnabled?: boolean;
	detailsSubmitted?: boolean;
}

interface ConnectedAccountDoc extends mongoose.Document {
	userId: string;
	stripeAccountId: string;
	payoutsEnabled: boolean;
	detailsSubmitted: boolean;
}

interface ConnectedAccountModel extends mongoose.Model<ConnectedAccountDoc> {
	build(attrs: ConnectedAccountAttrs): ConnectedAccountDoc;
}

const connectedAccountSchema = new mongoose.Schema<ConnectedAccountDoc>(
	{
		userId: { type: String, required: true, unique: true },
		stripeAccountId: { type: String, required: true },
		payoutsEnabled: { type: Boolean, required: true, default: false },
		detailsSubmitted: { type: Boolean, required: true, default: false },
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

connectedAccountSchema.statics.build = (attrs: ConnectedAccountAttrs) =>
	new ConnectedAccount(attrs);

const ConnectedAccount = mongoose.model<
	ConnectedAccountDoc,
	ConnectedAccountModel
>('ConnectedAccount', connectedAccountSchema);

export { ConnectedAccount, ConnectedAccountDoc };
