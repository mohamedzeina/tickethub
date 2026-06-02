// Idempotent-consumer helper.
//
// NATS Streaming delivers at-least-once, so a listener can see the same message
// more than once (redelivery after a missed ack, a consumer restart, or a
// queue-group rebalance). For listeners whose side effects aren't already
// guarded by version ordering, run them through `processOnce` so the effect is
// applied a single time.
//
// `common` stays storage-agnostic: each service supplies its own
// `ProcessedEvent` store (a Mongo collection keyed uniquely on
// `{ channel, sequence }`). The unique index is what makes concurrent
// processing safe — `markProcessed` swallows the duplicate-key error.

export interface ProcessedEventStore {
	isProcessed(channel: string, sequence: number): Promise<boolean>;
	markProcessed(channel: string, sequence: number): Promise<void>;
}

// Runs `apply` only if (channel, sequence) hasn't been processed before.
// Returns true if the work ran, false if it was skipped as a duplicate.
//
// Order is check -> apply -> mark: the side effects here are idempotent, so a
// crash between apply and mark just replays them on redelivery (safe), whereas
// marking first would risk dropping the effect entirely.
export const processOnce = async (
	store: ProcessedEventStore,
	channel: string,
	sequence: number,
	apply: () => Promise<void>,
): Promise<boolean> => {
	if (await store.isProcessed(channel, sequence)) {
		return false;
	}

	await apply();
	await store.markProcessed(channel, sequence);
	return true;
};
