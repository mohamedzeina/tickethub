import type mongoose from 'mongoose';
import { DeadLetterStore, DeadLetterEntry } from './dead-letter';

// Dead-letter record for poison messages (B3). JetStream counts the deliveries
// and stops redelivering at max_deliver; this just archives the message the base
// listener gave up on — one row per (channel, sequence) with the raw payload,
// last error, and `attempts` (JetStream's delivery count) for inspection /
// replay. Sibling of ProcessedEvent, and a factory for the same reason.

export interface FailedEventDoc extends mongoose.Document {
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
export interface FailedEventModel
	extends mongoose.Model<FailedEventDoc>,
		DeadLetterStore {}

export const makeFailedEventModel = (): FailedEventModel => {
	// Required lazily, not imported: this module is re-exported from the
	// package index, and `expiration` has no database and therefore no
	// mongoose. An eager import would crash it on boot.
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const mongoose: typeof import('mongoose') = require('mongoose');

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

	failedEventSchema.statics.deadLetter = async function (
		entry: DeadLetterEntry,
	) {
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

	return mongoose.model<FailedEventDoc, FailedEventModel>(
		'FailedEvent',
		failedEventSchema,
	);
};
