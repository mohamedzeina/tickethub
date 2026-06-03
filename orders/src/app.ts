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
} from '@zeina-tickethub/common';

import { indexOrderRouter } from './routes';
import { newOrderRouter } from './routes/new';
import { showOrderRouter } from './routes/show';
import { cancelOrderRouter } from './routes/cancel';
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
app.use(requestLogger);
app.use(json());
app.use(
	cookieSession({
		signed: false, // no encryption
		secure: process.env.NODE_ENV !== 'test', // only works on https in production, but works on http in test environment
	}),
);
app.use(currentUser);

app.use(newOrderRouter);
app.use(indexOrderRouter);
app.use(showOrderRouter);
app.use(cancelOrderRouter);

app.all('*', async () => {
	throw new NotFoundError();
});

app.use(errorHandler);

export { app };
