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

import { addWishlistRouter } from './routes/add';
import { removeWishlistRouter } from './routes/remove';
import { wishlistIdsRouter } from './routes/ids';
import { listWishlistRouter } from './routes/list';
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
		secure: process.env.NODE_ENV !== 'test',
	}),
);
app.use(currentUser);

// Literal /ids before the parameterized /:ticketId so neither shadows the other.
app.use(wishlistIdsRouter);
app.use(addWishlistRouter);
app.use(removeWishlistRouter);
app.use(listWishlistRouter);

app.all('*', async () => {
	throw new NotFoundError();
});

app.use(errorHandler);

export { app };
