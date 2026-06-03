import express from 'express';
import 'express-async-errors';
import { json } from 'body-parser';
import cookieSession from 'cookie-session';
import mongoose from 'mongoose';

import {
	errorHandler,
	NotFoundError,
	currentUser,
	healthRouter,
	requestLogger,
	metricsRouter,
	httpMetrics,
} from '@zeina-tickethub/common';

import { indexNotificationRouter } from './routes';
import { readNotificationRouter } from './routes/read';
import { readAllNotificationRouter } from './routes/read-all';
import { natsWrapper } from './nats-wrapper';

const app = express();
app.set('trust proxy', true);
app.use(
	healthRouter({
		checks: {
			mongo: () => mongoose.connection.readyState === 1,
			nats: () => natsWrapper.isConnected,
		},
	}),
);
app.use(metricsRouter());
app.use(httpMetrics);
app.use(requestLogger);
app.use(json());
app.use(
	cookieSession({
		signed: false, // no encryption
		secure: process.env.NODE_ENV !== 'test', // only works on https in production, but works on http in test environment
	}),
);
app.use(currentUser);

// read-all is registered before the :id/read route so the literal path wins.
app.use(readAllNotificationRouter);
app.use(readNotificationRouter);
app.use(indexNotificationRouter);

app.all('*', async () => {
	throw new NotFoundError();
});

app.use(errorHandler);

export { app };
