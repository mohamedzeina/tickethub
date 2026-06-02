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
} from '@zeina-tickethub/common';

import { createTicketRouter } from './routes/new';
import { showTicketRouter } from './routes/show';
import { indexTicketRouter } from './routes';
import { updateTicketRouter } from './routes/update';
import { uploadSignatureRouter } from './routes/upload-signature';
import { myTicketsRouter } from './routes/mine';
import { unlistTicketRouter } from './routes/unlist';
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
app.use(json());
app.use(
	cookieSession({
		signed: false, // no encryption
		secure: process.env.NODE_ENV !== 'test', // only works on https in production, but works on http in test environment
	}),
);
app.use(currentUser);

app.use(createTicketRouter);
// Register before showTicketRouter so '/api/tickets/upload-signature' and
// '/api/tickets/mine' are not captured by the '/api/tickets/:id' route.
app.use(uploadSignatureRouter);
app.use(myTicketsRouter);
app.use(showTicketRouter);
app.use(indexTicketRouter);
app.use(updateTicketRouter);
app.use(unlistTicketRouter);

app.all('*', async () => {
	throw new NotFoundError();
});

app.use(errorHandler);

export { app };
