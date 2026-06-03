import express from 'express';
import 'express-async-errors';
import { json } from 'body-parser';
import cookieSession from 'cookie-session';
import mongoose from 'mongoose';

import { currentUserRouter } from './routes/current-user';
import { signInRouter } from './routes/signin';
import { signOutRouter } from './routes/signout';
import { signUpRouter } from './routes/signup';
import {
	errorHandler,
	NotFoundError,
	healthRouter,
	requestLogger,
	metricsRouter,
	httpMetrics,
} from '@zeina-tickethub/common';

const app = express();
app.set('trust proxy', true);
app.use(
	healthRouter({
		checks: { mongo: () => mongoose.connection.readyState === 1 },
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

app.use(currentUserRouter);
app.use(signInRouter);
app.use(signOutRouter);
app.use(signUpRouter);

app.all('*', async () => {
	throw new NotFoundError();
});

app.use(errorHandler);

export { app };
