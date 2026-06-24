import mongoose from 'mongoose';

// An admission pass — the single-use credential a buyer shows at the gate.
// Multi-seat (#10): one pass PER SEAT, so a 3-seat order mints 3 independently
// redeemable passes. Identity is the compound (orderId, seat) — unique so a
// redelivered payment:created re-mints nothing. Each has its own QR / code and
// is scanned independently at the gate.
//
// The QR encodes a signed `code` derived from the pass id (see services/code.ts);
// the signature proves authenticity, while this `status` field enforces validity
// (single-use + revocation), so a downloaded QR stops working the moment the
// order is refunded or the pass is scanned.
//
// State transitions are done with atomic conditional updates
// (findOneAndUpdate on `status`), not save(), so two simultaneous gate scans
// can't both redeem the same pass — only one update matches `status: issued`.

export enum PassStatus {
	Issued = 'issued',
	Redeemed = 'redeemed',
	Revoked = 'revoked',
}

interface PassAttrs {
	orderId: string;
	// 1-based seat index within the order (1..quantity). Defaults to 1.
	seat?: number;
	buyerId: string;
	ticketId: string;
	eventTitle: string;
	venue?: string;
	eventDate?: Date;
}

interface PassDoc extends mongoose.Document {
	orderId: string;
	seat: number;
	buyerId: string;
	ticketId: string;
	eventTitle: string;
	venue?: string;
	eventDate?: Date;
	status: PassStatus;
	redeemedAt?: Date;
}

interface PassModel extends mongoose.Model<PassDoc> {
	build(attrs: PassAttrs): PassDoc;
}

const passSchema = new mongoose.Schema<PassDoc>(
	{
		orderId: { type: String, required: true },
		seat: { type: Number, required: true, default: 1, min: 1 },
		buyerId: { type: String, required: true },
		ticketId: { type: String, required: true },
		eventTitle: { type: String, required: true },
		venue: { type: String, required: false },
		eventDate: { type: mongoose.Schema.Types.Date, required: false },
		status: {
			type: String,
			required: true,
			enum: Object.values(PassStatus),
			default: PassStatus.Issued,
		},
		redeemedAt: { type: mongoose.Schema.Types.Date, required: false },
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

// One pass per seat: a redelivered payment:created can't double-mint.
passSchema.index({ orderId: 1, seat: 1 }, { unique: true });

passSchema.statics.build = (attrs: PassAttrs) => {
	return new Pass(attrs);
};

const Pass = mongoose.model<PassDoc, PassModel>('Pass', passSchema);

export { Pass };
