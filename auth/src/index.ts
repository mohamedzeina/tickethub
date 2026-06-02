import mongoose from 'mongoose';

import { app } from './app';

const startAuthService = async () => {
	if (!process.env.JWT_KEY) {
		throw new Error('JWT_KEY must be defined');
	}
	if (!process.env.MONGO_URI) {
		throw new Error('MONGO_URI must be defined');
	}

	try {
		await mongoose.connect(process.env.MONGO_URI);
		console.log('Connected to Auth MongoDB');
	} catch (err) {
		console.error(err);
	}

	const server = app.listen(3000, () => {
		console.log('Auth service is running on port 3000');
	});

	const shutdown = async (signal: string) => {
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

startAuthService();
