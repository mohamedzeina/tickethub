import express, { Request, Response } from 'express';
import {
	requireAuth,
	NotFoundError,
	OrderStatus,
	NotAuthorizedError,
	BadRequestError,
} from '@zeina-tickethub/common';
import { Order } from '../models/order';
import { Ticket } from '../models/ticket';
import { OrderCancelledPublisher } from '../events/publishers/order-cancelled-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

router.delete(
	'/api/orders/:orderId',
	requireAuth,
	async (req: Request, res: Response) => {
		const order = await Order.findById(req.params.orderId).populate('ticket');

		if (!order) {
			throw new NotFoundError();
		}

		if (order.userId !== req.currentUser!.id) {
			throw new NotAuthorizedError();
		}

		// Cancel is for releasing an UNPAID hold. A paid order must go through the
		// refund endpoint so the charge is actually returned.
		if (
			order.status === OrderStatus.Complete ||
			order.status === OrderStatus.Refunded
		) {
			throw new BadRequestError(
				'A paid order can’t be cancelled — request a refund instead.',
			);
		}

		// Idempotent: a second cancel must not release the seats twice (#10).
		if (order.status === OrderStatus.Cancelled) {
			res.status(204).send(order);
			return;
		}

		order.status = OrderStatus.Cancelled;
		await order.save();

		// Return the held seats to the listing's pool.
		await Ticket.releaseSeats(order.ticket.id, order.quantity);

		// Publish an event saying that the order was cancelled
		new OrderCancelledPublisher(natsWrapper.js).publish({
			id: order.id,
			version: order.version,
			quantity: order.quantity,
			ticket: {
				id: order.ticket.id,
			},
		});

		res.status(204).send(order);
	},
);

export { router as cancelOrderRouter };
