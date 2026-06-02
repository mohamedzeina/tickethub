import mongoose from 'mongoose';
import { app } from './app';
import { natsWrapper } from './nats-wrapper';
import { OrderCreatedListener } from './events/listeners/order-created-listener';
import { OrderCancelledListener } from './events/listeners/order-cancelled-listener';

const startTicketsService = async () => {
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
	if (!process.env.NATS_CLUSTER_ID) {
		throw new Error('NATS_CLUSTER_ID must be defined');
	}
	if (!process.env.NATS_CLIENT_ID) {
		throw new Error('NATS_CLIENT_ID must be defined');
	}

	try {
		await natsWrapper.connect(
			process.env.NATS_CLUSTER_ID,
			process.env.NATS_CLIENT_ID,
			process.env.NATS_URL,
		);

		natsWrapper.client.on('close', () => {
			if (!isShuttingDown) {
				console.log('NATS connection closed unexpectedly, exiting');
				process.exit(1);
			}
		});

		new OrderCreatedListener(natsWrapper.client).listen();
		new OrderCancelledListener(natsWrapper.client).listen();

		await mongoose.connect(process.env.MONGO_URI);
		console.log('Connected to Tickets MongoDB');
	} catch (err) {
		console.error(err);
	}

	const server = app.listen(3000, () => {
		console.log('Payments service is running on port 3000');
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
			natsWrapper.client.close();
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

startTicketsService();
