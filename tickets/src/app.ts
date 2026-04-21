import express from 'express';
import 'express-async-errors';
import { json } from 'body-parser';
import cookieSession from 'cookie-session';

import {
	errorHandler,
	NotFoundError,
	currentUser,
} from '@zeina-tickethub/common';

import { createTicketRouter } from './routes/new';
import { showTicketRouter } from './routes/show';
import { indexTicketRouter } from './routes';
import { updateTicketRouter } from './routes/update';

const app = express();
app.set('trust proxy', true);
app.use(json());
app.use(
	cookieSession({
		signed: false, // no encryption
		secure: process.env.NODE_ENV !== 'test', // only works on https in production, but works on http in test environment
	}),
);
app.use(currentUser);

app.use(createTicketRouter);
app.use(showTicketRouter);
app.use(indexTicketRouter);
app.use(updateTicketRouter);

app.all('*', async () => {
	throw new NotFoundError();
});

app.use(errorHandler);

export { app };
