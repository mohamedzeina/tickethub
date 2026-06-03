import express, { Request, Response } from 'express';
import {
	NotFoundError,
	requireAuth,
	validateRequest,
	BadRequestError,
	OrderStatus,
	client,
} from '@zeina-tickethub/common';
import { body } from 'express-validator';
import { Ticket } from '../models/ticket';
import { Order } from '../models/order';
import { OrderCreatedPublisher } from '../events/publishers/order-created-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

const ordersCreated = new client.Counter({
	name: 'orders_created_total',
	help: 'Orders created (tickets reserved)',
});

router.post(
	'/api/orders',
	requireAuth,
	[body('ticketId').not().isEmpty().withMessage('ticketId must be provided')],
	validateRequest,
	async (req: Request, res: Response) => {
		const { ticketId } = req.body;

		// Find the ticket the user is trying to order in the database
		const ticket = await Ticket.findById(ticketId);
		if (!ticket) {
			throw new NotFoundError();
		}

		// A seller may unlist a ticket; it can no longer be reserved
		if (ticket.unlisted) {
			throw new BadRequestError('This ticket is no longer for sale');
		}

		// A user cannot buy a ticket they listed themselves
		if (ticket.userId && ticket.userId === req.currentUser!.id) {
			throw new BadRequestError('You cannot buy your own ticket');
		}

		// Make sure the ticket is not already reserved
		// Run query to look at all orders. Find an order where the ticket
		// is the ticket we just found *and* the orders status is *not* cancelled
		// If we find an order from that means the ticket *is* reserved
		const isReserved = await ticket.isReserved();
		if (isReserved) {
			throw new BadRequestError('Ticket is already reserved');
		}

		// Calculate an expiration date for this order
		const expirationWindow = parseInt(process.env.EXPIRATION_WINDOW_SECONDS!);
		const expiration = new Date();
		expiration.setSeconds(expiration.getSeconds() + expirationWindow);

		// Build the order and save it to the database
		const order = Order.build({
			userId: req.currentUser!.id,
			status: OrderStatus.Created,
			expiresAt: expiration,
			ticket,
		});
		await order.save();
		ordersCreated.inc();

		// Publish an event saying that an order was created
		new OrderCreatedPublisher(natsWrapper.js).publish({
			id: order.id,
			version: order.version,
			status: order.status,
			userId: order.userId,
			expiresAt: order.expiresAt.toISOString(),
			ticket: {
				id: ticket.id,
				price: ticket.price,
			},
		});

		// Return the order to the client
		res.status(201).send(order);
	},
);

export { router as newOrderRouter };
