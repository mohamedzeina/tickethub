import mongoose from 'mongoose';
import { ProcessedEventStore } from '@zeina-tickethub/common';

// One row per event this service has handled, keyed uniquely on the NATS
// channel + message sequence. Lets listeners apply at-least-once-delivered
// events exactly once (see `processOnce` in common).

interface ProcessedEventDoc extends mongoose.Document {
	channel: string;
	sequence: number;
}

// Statics double as the `ProcessedEventStore` the idempotency helper expects.
interface ProcessedEventModel
	extends mongoose.Model<ProcessedEventDoc>,
		ProcessedEventStore {}

const processedEventSchema = new mongoose.Schema<ProcessedEventDoc>({
	channel: {
		type: String,
		required: true,
	},
	sequence: {
		type: Number,
		required: true,
	},
});

// The unique index is the concurrency guard: two workers racing the same
// message can both pass the read check, but only one wins the insert.
processedEventSchema.index({ channel: 1, sequence: 1 }, { unique: true });

processedEventSchema.statics.isProcessed = async function (
	channel: string,
	sequence: number,
) {
	const existing = await this.findOne({ channel, sequence });
	return !!existing;
};

processedEventSchema.statics.markProcessed = async function (
	channel: string,
	sequence: number,
) {
	try {
		await this.create({ channel, sequence });
	} catch (err: any) {
		// 11000 = duplicate key: another worker already recorded it. Benign.
		if (err?.code !== 11000) {
			throw err;
		}
	}
};

const ProcessedEvent = mongoose.model<ProcessedEventDoc, ProcessedEventModel>(
	'ProcessedEvent',
	processedEventSchema,
);

export { ProcessedEvent };
