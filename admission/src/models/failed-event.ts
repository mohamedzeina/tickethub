import mongoose from 'mongoose';
import { DeadLetterStore, DeadLetterEntry } from '@zeina-tickethub/common';

// Dead-letter record for poison messages (B3). JetStream counts the deliveries
// and stops redelivering at max_deliver; this just archives the message the base
// listener gave up on — one row per (channel, sequence) with the raw payload,
// last error, and `attempts` (JetStream's delivery count) for inspection /
// replay. Sibling of ProcessedEvent.

interface FailedEventDoc extends mongoose.Document {
	channel: string;
	sequence: number;
	queueGroup?: string;
	attempts: number;
	data?: string;
	errorName?: string;
	error?: string;
	deadLettered: boolean;
}

// Statics double as the `DeadLetterStore` the base listener expects.
interface FailedEventModel
	extends mongoose.Model<FailedEventDoc>,
		DeadLetterStore {}

const failedEventSchema = new mongoose.Schema<FailedEventDoc>(
	{
		channel: { type: String, required: true },
		sequence: { type: Number, required: true },
		queueGroup: { type: String },
		attempts: { type: Number, required: true, default: 0 },
		data: { type: String },
		errorName: { type: String },
		error: { type: String },
		deadLettered: { type: Boolean, required: true, default: false },
	},
	{ timestamps: true },
);

// Unique per message so redeliveries land on the same row.
failedEventSchema.index({ channel: 1, sequence: 1 }, { unique: true });

failedEventSchema.statics.deadLetter = async function (entry: DeadLetterEntry) {
	await this.findOneAndUpdate(
		{ channel: entry.channel, sequence: entry.sequence },
		{
			$set: {
				queueGroup: entry.queueGroup,
				data: entry.data,
				errorName: entry.errorName,
				error: entry.error,
				attempts: entry.attempts,
				deadLettered: true,
			},
		},
		{ upsert: true },
	);
};

const FailedEvent = mongoose.model<FailedEventDoc, FailedEventModel>(
	'FailedEvent',
	failedEventSchema,
);

export { FailedEvent };
