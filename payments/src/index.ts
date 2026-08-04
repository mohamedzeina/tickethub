import './tracing'; // must be first — registers OTel instrumentation before other imports load
import mongoose from 'mongoose';
import { ensureStream, logger } from '@zeina-tickethub/common';
import { app } from './app';
import { natsWrapper } from './nats-wrapper';
import { OrderCreatedListener } from './events/listeners/order-created-listener';
import { OrderCancelledListener } from './events/listeners/order-cancelled-listener';
import { OrderRefundRequestedListener } from './events/listeners/order-refund-requested-listener';
import { OrderPayoutDueListener } from './events/listeners/order-payout-due-listener';

const startPaymentsService = async () => {
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
		await new OrderCancelledListener(natsWrapper.connection).listen();
		await new OrderRefundRequestedListener(natsWrapper.connection).listen();
		await new OrderPayoutDueListener(natsWrapper.connection).listen();

		await mongoose.connect(process.env.MONGO_URI);
		logger.info('connected to MongoDB');
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

startPaymentsService();
