import mongoose from 'mongoose';
import { updateIfCurrentPlugin } from 'mongoose-update-if-current';

interface PaymentAttrs {
	orderId: string;
	stripeId: string;
}

interface PaymentDoc extends mongoose.Document {
	orderId: string;
	stripeId: string;
}

// Interface for the JSON representation after transformation
interface PaymentJSON {
	_id?: mongoose.Types.ObjectId;
	orderId: string;
	stripeId: string;
	id?: string;
}

interface PaymentModel extends mongoose.Model<PaymentDoc> {
	build(attrs: PaymentAttrs): PaymentDoc;
}

const paymentSchema = new mongoose.Schema(
	{
		orderId: {
			required: true,
			type: String,
		},
		stripeId: {
			required: true,
			type: String,
			// One payment per Stripe intent. Makes the webhook idempotent against
			// concurrent redeliveries (the check-then-insert guard alone races
			// across pods): the losing insert hits a duplicate-key error. (#5)
			unique: true,
		},
	},
	{
		toJSON: {
			transform(doc: PaymentDoc, ret: PaymentJSON) {
				((ret.id = ret._id?.toString()), delete ret._id);
			},
		},
	},
);

paymentSchema.statics.build = (attrs: PaymentAttrs) => {
	return new Payment(attrs);
};

const Payment = mongoose.model<PaymentDoc, PaymentModel>(
	'Payment',
	paymentSchema,
);

export { Payment };
