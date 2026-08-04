import './tracing'; // must be first — registers OTel instrumentation before other imports load
import mongoose from 'mongoose';
import { ensureStream, logger } from '@zeina-tickethub/common';
import { app } from './app';
import { natsWrapper } from './nats-wrapper';
import { OrderCreatedListener } from './events/listeners/order-created-listener';
import { PaymentCreatedListener } from './events/listeners/payment-created-listener';
import { PaymentRefundedListener } from './events/listeners/payment-refunded-listener';
import { PayoutProcessedListener } from './events/listeners/payout-processed-listener';
import { TicketRedeemedListener } from './events/listeners/ticket-redeemed-listener';
import { ExpirationWarningListener } from './events/listeners/expiration-warning-listener';
import { ExpirationCompleteListener } from './events/listeners/expiration-complete-listener';
import { UserVerificationRequestedListener } from './events/listeners/user-verification-requested-listener';
import { PasswordResetRequestedListener } from './events/listeners/password-reset-requested-listener';
import { WishlistPriceDroppedListener } from './events/listeners/wishlist-price-dropped-listener';
import { WishlistAvailableListener } from './events/listeners/wishlist-available-listener';
import { ReviewCreatedListener } from './events/listeners/review-created-listener';
import { Notification } from './models/notification';

// Config the service can't run without. Checked before we touch NATS or Mongo
// so a misconfigured pod fails loudly on boot instead of mid-event.
const requiredEnv = ['JWT_KEY', 'MONGO_URI', 'NATS_URL', 'NATS_CLIENT_ID'];

// Started in this order; the array is the single place to register a listener.
const listeners = [
	OrderCreatedListener,
	PaymentCreatedListener,
	PaymentRefundedListener,
	PayoutProcessedListener,
	TicketRedeemedListener,
	ExpirationWarningListener,
	ExpirationCompleteListener,
	UserVerificationRequestedListener,
	PasswordResetRequestedListener,
	WishlistPriceDroppedListener,
	WishlistAvailableListener,
	ReviewCreatedListener,
];

const startNotificationsService = async () => {
	let isShuttingDown = false;

	for (const name of requiredEnv) {
		if (!process.env[name]) {
			throw new Error(`${name} must be defined`);
		}
	}

	try {
		// Non-null: the requiredEnv loop above already bailed if either is unset.
		await natsWrapper.connect(
			process.env.NATS_URL!,
			process.env.NATS_CLIENT_ID!,
		);

		natsWrapper.connection.closed().then(() => {
			if (!isShuttingDown) {
				logger.error('NATS connection closed unexpectedly, exiting');
				process.exit(1);
			}
		});

		await ensureStream(natsWrapper.connection);

		// Mongo before the listeners, not after: every handler writes to it, so
		// starting the consume loops first means a backlog can be delivered to a
		// service with no database — and, worse, before the index below exists.
		await mongoose.connect(process.env.MONGO_URI!);
		logger.info('connected to MongoDB');

		// Build the sparse unique index on Notification.dedupeKey — it's what
		// turns a redelivered event into a no-op instead of a duplicate feed
		// row, so it has to exist before any handler writes. Idempotent and safe
		// every boot; pre-existing rows carry no key, so nothing collides.
		await Notification.syncIndexes();
		logger.info('notification indexes synced');

		for (const Listener of listeners) {
			await new Listener(natsWrapper.connection).listen();
		}
	} catch (err) {
		// Fatal. A service that couldn't reach NATS or Mongo can't do its job,
		// and carrying on would leave a pod that looks alive but silently
		// consumes nothing — exactly what a lost NATS connection already exits
		// for above. Crash instead, and let Kubernetes restart us with backoff.
		logger.error({ err }, 'failed to start service');
		process.exit(1);
	}

	const server = app.listen(3000, () => {
		logger.info({ port: 3000 }, 'service listening');
	});

	const shutdown = async (signal: string) => {
		if (isShuttingDown) return;
		isShuttingDown = true;
		logger.info({ signal }, 'received signal, shutting down gracefully');

		// Backstop in case draining hangs (e.g. a stuck keep-alive connection).
		const forceExit = setTimeout(() => {
			logger.error('could not shut down in time, forcing exit');
			process.exit(1);
		}, 10000);
		forceExit.unref();

		try {
			await new Promise<void>((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()));
			});
			await natsWrapper.connection.close();
			await mongoose.disconnect();
		} catch (err) {
			logger.error({ err }, 'error during graceful shutdown');
		} finally {
			clearTimeout(forceExit);
			process.exit(0);
		}
	};

	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
};

startNotificationsService();
