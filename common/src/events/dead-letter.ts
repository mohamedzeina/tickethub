// Dead-letter handling for poison messages (B3), JetStream edition.
//
// JetStream now owns the retry mechanics: a durable consumer redelivers an
// un-acked / nak'd message up to `max_deliver` times. The base listener watches
// the per-message delivery count and, on the final failed delivery, archives the
// message here and `term()`s it so JetStream stops redelivering. The store is
// kept purely for inspection / replay — the attempt *counting* that the previous
// (STAN) implementation did by hand is gone, since JetStream tracks it.
//
// `common` stays storage-agnostic: each service supplies its own
// `DeadLetterStore` (Mongo for the data services, Redis for expiration).

export interface DeadLetterEntry {
	channel: string;
	sequence: number;
	queueGroup: string;
	// Raw payload, so the event can be replayed verbatim.
	data: string;
	errorName?: string;
	error?: string;
	// Delivery count at termination (JetStream's redeliveryCount).
	attempts: number;
}

export interface DeadLetterStore {
	// Persist a message that exhausted its JetStream deliveries.
	deadLetter(entry: DeadLetterEntry): Promise<void>;
}
