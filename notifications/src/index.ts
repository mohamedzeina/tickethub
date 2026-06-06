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

const startNotificationsService = async () => {
	let isShuttingDown = false;

	if (!process.env.JWT_KEY) {
		throw new Error('JWT_KEY must be defined');
	}
	if (!process.env.MONGO_URI) {
		throw new Error('MONGO_URI must be defined');
	}
	if (!process.env.NATS_URL) {
		throw new Error('NATS_URL must be defined');
	}
	if (!process.env.NATS_CLIENT_ID) {
		throw new Error('NATS_CLIENT_ID must be defined');
	}

	try {
		await natsWrapper.connect(
			process.env.NATS_URL,
			process.env.NATS_CLIENT_ID,
		);

		natsWrapper.connection.closed().then(() => {
			if (!isShuttingDown) {
				logger.error('NATS connection closed unexpectedly, exiting');
				process.exit(1);
			}
		});

		await ensureStream(natsWrapper.connection);

		await new OrderCreatedListener(natsWrapper.connection).listen();
		await new PaymentCreatedListener(natsWrapper.connection).listen();
		await new PaymentRefundedListener(natsWrapper.connection).listen();
		await new PayoutProcessedListener(natsWrapper.connection).listen();
		await new TicketRedeemedListener(natsWrapper.connection).listen();
		await new ExpirationWarningListener(natsWrapper.connection).listen();
		await new ExpirationCompleteListener(natsWrapper.connection).listen();
		await new UserVerificationRequestedListener(natsWrapper.connection).listen();
		await new PasswordResetRequestedListener(natsWrapper.connection).listen();
		await new WishlistPriceDroppedListener(natsWrapper.connection).listen();
		await new WishlistAvailableListener(natsWrapper.connection).listen();
		await new ReviewCreatedListener(natsWrapper.connection).listen();

		await mongoose.connect(process.env.MONGO_URI);
		logger.info('connected to MongoDB');
	} catch (err) {
		logger.error({ err }, 'failed to start service');
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
