import type mongoose from 'mongoose';
import { ProcessedEventStore } from './idempotent';
import { isDuplicateKey } from '../is-duplicate-key';

// One row per event a service has handled, keyed uniquely on the NATS channel +
// message sequence. Lets listeners apply at-least-once-delivered events exactly
// once (see `processOnce`).
//
// A FACTORY, not a model created on import: `mongoose.model()` registers
// globally, so building it here would give every service that merely imports
// this package a processedevents collection and its index — including auth,
// which has no listeners. Services that need it call this once.

export interface ProcessedEventDoc extends mongoose.Document {
	channel: string;
	sequence: number;
}

// Statics double as the `ProcessedEventStore` the idempotency helper expects.
export interface ProcessedEventModel
	extends mongoose.Model<ProcessedEventDoc>,
		ProcessedEventStore {}

export const makeProcessedEventModel = (): ProcessedEventModel => {
	// Required lazily, not imported: this module is re-exported from the
	// package index, and `expiration` has no database and therefore no
	// mongoose. An eager import would crash it on boot.
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const mongoose: typeof import('mongoose') = require('mongoose');

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
			// Duplicate key: another worker already recorded it. Benign.
			if (!isDuplicateKey(err)) {
				throw err;
			}
		}
	};

	return mongoose.model<ProcessedEventDoc, ProcessedEventModel>(
		'ProcessedEvent',
		processedEventSchema,
	);
};
