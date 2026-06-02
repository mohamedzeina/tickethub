import mongoose from 'mongoose';
import { ensureStream } from '@zeina-tickethub/common';
import { app } from './app';
import { natsWrapper } from './nats-wrapper';
import { TicketCreatedListener } from './events/listeners/ticket-created-listener';
import { TicketUpdatedListener } from './events/listeners/ticket-updated-listener';
import { ExpirationCompleteListener } from './events/listeners/expiration-complete-listener';
import { PaymentCreatedListener } from './events/listeners/payment-created-listener';

const startOrdersService = async () => {
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
	if (!process.env.EXPIRATION_WINDOW_SECONDS) {
		throw new Error('EXPIRATION_WINDOW_SECONDS must be defined');
	}

	try {
		await natsWrapper.connect(
			process.env.NATS_URL,
			process.env.NATS_CLIENT_ID,
		);

		natsWrapper.connection.closed().then(() => {
			if (!isShuttingDown) {
				console.log('NATS connection closed unexpectedly, exiting');
				process.exit(1);
			}
		});

		await ensureStream(natsWrapper.connection);

		await new TicketCreatedListener(natsWrapper.connection).listen();
		await new TicketUpdatedListener(natsWrapper.connection).listen();
		await new ExpirationCompleteListener(natsWrapper.connection).listen();
		await new PaymentCreatedListener(natsWrapper.connection).listen();

		await mongoose.connect(process.env.MONGO_URI);
		console.log('Connected to Orders MongoDB');
	} catch (err) {
		console.error(err);
	}

	const server = app.listen(3000, () => {
		console.log('Orders service is running on port 3000');
	});

	const shutdown = async (signal: string) => {
		if (isShuttingDown) return;
		isShuttingDown = true;
		console.log(`${signal} received, shutting down gracefully`);

		// Backstop in case draining hangs (e.g. a stuck keep-alive connection).
		const forceExit = setTimeout(() => {
			console.error('Could not shut down in time, forcing exit');
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
			console.error('Error during graceful shutdown', err);
		} finally {
			clearTimeout(forceExit);
			process.exit(0);
		}
	};

	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
};

startOrdersService();
