import express, { Request, Response } from 'express';
import {
	requireAuth,
	BadRequestError,
	OrderStatus,
} from '@zeina-tickethub/common';
import { isRefundable } from '../services/refund-window';
import { loadOwnedOrder } from '../services/load-owned-order';
import { OrderRefundRequestedPublisher } from '../events/publishers/order-refund-requested-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

// Buyer requests a refund on a completed order. We validate the policy here, mark
// refundRequestedAt (so the receipt can show "refund processing"), and publish
// order:refund:requested. Payments does the Stripe refund and the actual
// Refunded status only lands once the Stripe webhook confirms it settled.
router.post(
	'/api/orders/:orderId/refund',
	requireAuth,
	async (req: Request, res: Response) => {
		const order = await loadOwnedOrder(req);

		if (order.status === OrderStatus.Refunded || order.refundRequestedAt) {
			throw new BadRequestError('This order is already being refunded.');
		}
		if (order.status !== OrderStatus.Complete) {
			throw new BadRequestError('Only a paid order can be refunded.');
		}
		if (order.redeemedAt) {
			throw new BadRequestError(
				"This ticket has already been scanned in and can't be refunded.",
			);
		}
		if (!isRefundable(order)) {
			throw new BadRequestError('The refund window for this order has passed.');
		}

		order.set({ refundRequestedAt: new Date() });
		await order.save();

		await new OrderRefundRequestedPublisher(natsWrapper.js).publish({
			id: order.id,
		});

		res.status(200).send(order);
	},
);

export { router as refundOrderRouter };
