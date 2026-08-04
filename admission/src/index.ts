import './tracing'; // must be first — registers OTel instrumentation before other imports load
import mongoose from 'mongoose';
import { ensureStream, logger } from '@zeina-tickethub/common';
import { app } from './app';
import { natsWrapper } from './nats-wrapper';
import { TicketCreatedListener } from './events/listeners/ticket-created-listener';
import { TicketUpdatedListener } from './events/listeners/ticket-updated-listener';
import { OrderCreatedListener } from './events/listeners/order-created-listener';
import { PaymentCreatedListener } from './events/listeners/payment-created-listener';
import { PaymentRefundedListener } from './events/listeners/payment-refunded-listener';
import { Pass } from './models/pass';

const startAdmissionService = async () => {
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
	if (!process.env.PASS_SIGNING_SECRET) {
		throw new Error('PASS_SIGNING_SECRET must be defined');
	}
	if (!process.env.GATE_API_KEY) {
		throw new Error('GATE_API_KEY must be defined');
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

		await new TicketCreatedListener(natsWrapper.connection).listen();
		await new TicketUpdatedListener(natsWrapper.connection).listen();
		await new OrderCreatedListener(natsWrapper.connection).listen();
		await new PaymentCreatedListener(natsWrapper.connection).listen();
		await new PaymentRefundedListener(natsWrapper.connection).listen();

		await mongoose.connect(process.env.MONGO_URI);
		logger.info('connected to MongoDB');

		// Multi-seat (#10) migration: passes moved from a single-field unique index
		// on orderId to a compound unique (orderId, seat). syncIndexes drops the
		// stale orderId_1 index (which would otherwise block minting a 2nd seat's
		// pass) and builds the compound one. Idempotent + safe to run every boot.
		await Pass.syncIndexes();
		logger.info('pass indexes synced');
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

startAdmissionService();
