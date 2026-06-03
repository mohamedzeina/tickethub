import './tracing'; // must be first — registers OTel instrumentation before other imports load
import { ensureStream, logger } from '@zeina-tickethub/common';
import { natsWrapper } from './nats-wrapper';
import { OrderCreatedListener } from './events/listeners/order-created-listener';
import { startHealthServer } from './health-server';
import { expirationQueue } from './queues/expiration-queue';

const startExpirationService = async () => {
	let isShuttingDown = false;

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
	} catch (err) {
		logger.error({ err }, 'failed to start service');
	}

	const server = startHealthServer(3000);

	const shutdown = async (signal: string) => {
		if (isShuttingDown) return;
		isShuttingDown = true;
		logger.info({ signal }, 'received signal, shutting down gracefully');

		// Backstop in case draining hangs.
		const forceExit = setTimeout(() => {
			logger.error('could not shut down in time, forcing exit');
			process.exit(1);
		}, 10000);
		forceExit.unref();

		try {
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await expirationQueue.close();
			await natsWrapper.connection.close();
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

startExpirationService();
