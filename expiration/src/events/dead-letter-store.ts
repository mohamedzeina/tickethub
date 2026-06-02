import { DeadLetterStore, DeadLetterEntry } from '@zeina-tickethub/common';
import { expirationQueue } from '../queues/expiration-queue';

// Redis-backed dead-letter store (B3) for the expiration service, which has no
// Mongo. It reuses the Bull queue's ioredis connection (`expirationQueue.client`).
//
// JetStream now counts deliveries and caps retries via the consumer's
// max_deliver, so there's no attempt counter to keep here — this just archives a
// poison message's payload onto a list for later inspection / replay.

const DEAD_LETTER_LIST = 'deadletter:events';

export const redisDeadLetterStore: DeadLetterStore = {
	async deadLetter(entry: DeadLetterEntry) {
		const client = expirationQueue.client;
		await client.rpush(
			DEAD_LETTER_LIST,
			JSON.stringify({ ...entry, deadLetteredAt: new Date().toISOString() }),
		);
	},
};
