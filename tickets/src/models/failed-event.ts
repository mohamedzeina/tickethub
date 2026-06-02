import mongoose from 'mongoose';
import { DeadLetterStore, DeadLetterEntry } from '@zeina-tickethub/common';

// Dead-letter record for poison messages (B3). One row per failing
// (channel, sequence): `attempts` counts redeliveries, and once the base
// listener gives up it flips `deadLettered` and stores the raw payload + last
// error so the event can be inspected and replayed. Sibling of ProcessedEvent.

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

// Atomic upsert + $inc: concurrent redeliveries (multiple replicas, queue-group
// rebalance) can't lose a count. Returns the running attempt total.
failedEventSchema.statics.recordFailure = async function (
	channel: string,
	sequence: number,
) {
	const doc = await this.findOneAndUpdate(
		{ channel, sequence },
		{ $inc: { attempts: 1 }, $setOnInsert: { channel, sequence } },
		{ upsert: true, new: true },
	);
	return doc.attempts;
};

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
