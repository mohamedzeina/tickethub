import express, { Request, Response } from 'express';
import {
	NotFoundError,
	requireAuth,
	requireVerified,
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

// Cap on seats a single order may claim. Per-service on purpose: tickets keeps
// its own copy of the same number — sharing it would mean putting it in the
// common package.
const MAX_SEATS_PER_ORDER = 20;

const ordersCreated = new client.Counter({
	name: 'orders_created_total',
	help: 'Orders created (tickets reserved)',
});

router.post(
	'/api/orders',
	requireAuth,
	requireVerified,
	[
		body('ticketId').not().isEmpty().withMessage('ticketId must be provided'),
		body('quantity')
			.optional()
			.isInt({ min: 1, max: MAX_SEATS_PER_ORDER })
			.withMessage(
				`Quantity must be a whole number between 1 and ${MAX_SEATS_PER_ORDER}`,
			)
			.toInt(),
	],
	validateRequest,
	async (req: Request, res: Response) => {
		const { ticketId } = req.body;
		const quantity: number = req.body.quantity ?? 1;

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

		// Multi-seat (#10): atomically claim the requested seats. This single op is
		// the oversell guard — concurrent buyers can't both take the last seat. A
		// null result means not enough seats remain (or it was just unlisted).
		const reserved = await Ticket.reserveSeats(ticketId, quantity);
		if (!reserved) {
			// Re-read before quoting a number: the `ticket` snapshot above predates
			// the reservation attempt, so under contention it would report seats that
			// someone else has already taken. The guard itself is the atomic op — this
			// is only about the message telling the truth.
			const current = await Ticket.findById(ticketId);
			const remaining = current
				? Math.max(0, current.quantity - current.reservedSeats)
				: 0;
			throw new BadRequestError(
				remaining > 0
					? `Only ${remaining} seat${remaining === 1 ? '' : 's'} left`
					: 'Ticket is sold out',
			);
		}

		// Calculate an expiration date for this order
		const expirationWindow = parseInt(process.env.EXPIRATION_WINDOW_SECONDS!);
		const expiration = new Date();
		expiration.setSeconds(expiration.getSeconds() + expirationWindow);

		// Build the order and save it to the database. If persisting fails after the
		// seats were claimed, hand them back so the listing isn't left short.
		const order = Order.build({
			userId: req.currentUser!.id,
			userEmail: req.currentUser!.email,
			status: OrderStatus.Created,
			expiresAt: expiration,
			ticket,
			quantity,
		});
		try {
			await order.save();
		} catch (err) {
			await Ticket.releaseSeats(ticketId, quantity);
			throw err;
		}
		ordersCreated.inc();

		// Publish an event saying that an order was created
		new OrderCreatedPublisher(natsWrapper.js).publish({
			id: order.id,
			version: order.version,
			status: order.status,
			userId: order.userId,
			userEmail: req.currentUser!.email,
			expiresAt: order.expiresAt.toISOString(),
			// The seller (ticket owner) so notifications can tell them their ticket
			// sold / was refunded (#11).
			sellerId: ticket.userId,
			quantity: order.quantity,
			ticket: {
				id: ticket.id,
				price: ticket.price,
				title: ticket.title,
			},
		});

		// Return the order to the client
		res.status(201).send(order);
	},
);

export { router as newOrderRouter };
