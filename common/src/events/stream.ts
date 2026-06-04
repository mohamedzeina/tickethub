import { NatsConnection, RetentionPolicy, StorageType } from 'nats';
import { Subjects } from './subjects';

// All TicketHub events live in one JetStream stream, persisted to disk so
// messages and consumer state survive a NATS pod restart (replaces the STAN
// file-store hack from A3). Subjects use ':' which is a literal character in
// NATS (not the '.' token separator), so they're listed explicitly rather than
// matched with wildcards.
export const STREAM_NAME = 'tickethub';

const STREAM_SUBJECTS: string[] = [
	Subjects.TicketCreated,
	Subjects.TicketUpdated,
	Subjects.OrderCreated,
	Subjects.OrderCancelled,
	Subjects.ExpirationComplete,
	Subjects.ExpirationWarning,
	Subjects.PaymentInitiated,
	Subjects.PaymentCreated,
	Subjects.PaymentRefunded,
	Subjects.UserVerificationRequested,
	Subjects.PasswordResetRequested,
];

// Create the stream if it doesn't exist. Every service calls this at startup;
// the first one wins and the rest harmlessly find it already present.
export const ensureStream = async (nc: NatsConnection): Promise<void> => {
	const jsm = await nc.jetstreamManager();
	try {
		await jsm.streams.add({
			name: STREAM_NAME,
			subjects: STREAM_SUBJECTS,
			storage: StorageType.File,
			retention: RetentionPolicy.Limits,
		});
	} catch (err) {
		// Already created by another service (or a prior boot). Confirm it's
		// really there — info() throws only if the stream is genuinely absent.
		await jsm.streams.info(STREAM_NAME);

		// Reconcile the subject list: adding new subjects (e.g. payment:initiated,
		// payment:refunded) to an existing stream needs an update(), since the
		// add() above no-ops once the stream exists. Adding subjects is a safe,
		// non-destructive change.
		await jsm.streams.update(STREAM_NAME, { subjects: STREAM_SUBJECTS });
	}
};
