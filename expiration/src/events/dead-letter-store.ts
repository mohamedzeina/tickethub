import { DeadLetterStore, DeadLetterEntry } from '@zeina-tickethub/common';
import { expirationQueue } from '../queues/expiration-queue';

// Redis-backed dead-letter store (B3) for the expiration service, which has no
// Mongo. It reuses the Bull queue's ioredis connection (`expirationQueue.client`).
//
// Attempts are a plain INCR counter with a TTL so a transient flap doesn't leave
// residue forever; INCR is atomic, which is the same concurrency guard the Mongo
// store gets from its unique index. Dead-lettered payloads are pushed onto a
// list for later inspection / replay.

const ATTEMPT_TTL_SECONDS = 24 * 60 * 60;
const DEAD_LETTER_LIST = 'deadletter:events';

const attemptsKey = (channel: string, sequence: number) =>
	`deadletter:attempts:${channel}:${sequence}`;

export const redisDeadLetterStore: DeadLetterStore = {
	async recordFailure(channel: string, sequence: number) {
		const client = expirationQueue.client;
		const key = attemptsKey(channel, sequence);
		const attempts = await client.incr(key);
		await client.expire(key, ATTEMPT_TTL_SECONDS);
		return attempts;
	},

	async deadLetter(entry: DeadLetterEntry) {
		const client = expirationQueue.client;
		await client.rpush(
			DEAD_LETTER_LIST,
			JSON.stringify({ ...entry, deadLetteredAt: new Date().toISOString() }),
		);
		// Counter has done its job; let it go rather than wait out the TTL.
		await client.del(attemptsKey(entry.channel, entry.sequence));
	},
};
