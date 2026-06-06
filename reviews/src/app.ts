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

import { createReviewRouter } from './routes/create';
import { updateReviewRouter } from './routes/update';
import { sellerReviewsRouter } from './routes/seller';
import { sellersReviewsRouter } from './routes/sellers';
import { orderReviewRouter } from './routes/order';
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

app.use(createReviewRouter);
app.use(updateReviewRouter);
app.use(sellerReviewsRouter);
app.use(sellersReviewsRouter);
app.use(orderReviewRouter);

app.all('*', async () => {
	throw new NotFoundError();
});

app.use(errorHandler);

export { app };
