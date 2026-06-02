// Dead-letter handling for poison messages.
//
// B2 leaves a failed message un-acked so NATS redelivers it after `ackWait`.
// That's the right move for a *transient* failure (a brief dependency blip, an
// out-of-order event waiting on its predecessor). But a *poison* message —
// permanently malformed data, or a payload that trips a handler bug — fails on
// every delivery and would redeliver forever, burning CPU and drowning the logs.
//
// B3 caps the retries: once a (channel, sequence) has failed `maxAttempts`
// times the base listener records it in a dead-letter store and acks it, so the
// redelivery loop stops. The archived entry keeps the raw payload and the last
// error so a human can inspect it and replay it once the cause is fixed.
//
// `common` stays storage-agnostic: each service supplies its own
// `DeadLetterStore` (Mongo for the data services, Redis for expiration), exactly
// as it does for the idempotent-consumer `ProcessedEventStore`.

export interface DeadLetterEntry {
	channel: string;
	sequence: number;
	queueGroup: string;
	// Raw NATS payload, so the event can be replayed verbatim.
	data: string;
	errorName?: string;
	error?: string;
	attempts: number;
}

export interface DeadLetterStore {
	// Record one failed delivery of (channel, sequence) and return the running
	// attempt count. Must be atomic: concurrent redeliveries (queue-group
	// rebalance, multiple replicas) must not lose a count.
	recordFailure(channel: string, sequence: number): Promise<number>;
	// Persist a message that has exhausted its retries.
	deadLetter(entry: DeadLetterEntry): Promise<void>;
}
