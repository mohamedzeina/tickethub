import express from 'express';
import 'express-async-errors';
import { json } from 'body-parser';
import cookieSession from 'cookie-session';
import mongoose from 'mongoose';
import { createChargeRouter } from './routes/new';
import { paymentWebhookRouter } from './routes/webhook';
import { connectRouter } from './routes/connect';

import {
	errorHandler,
	NotFoundError,
	currentUser,
	healthRouter,
	requestLogger,
	metricsRouter,
	httpMetrics,
} from '@zeina-tickethub/common';

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
// Mounted before json() so the Stripe webhook can read the raw request body
// for signature verification (it uses its own express.raw parser).
app.use(paymentWebhookRouter);
app.use(json());
app.use(
	cookieSession({
		signed: false, // no encryption
		secure: process.env.NODE_ENV !== 'test', // only works on https in production, but works on http in test environment
	}),
);
app.use(currentUser);

app.use(createChargeRouter);
app.use(connectRouter);

app.all('*', async () => {
	throw new NotFoundError();
});

app.use(errorHandler);

export { app };
