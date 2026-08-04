import { Request } from 'express';
import { NotFoundError, NotAuthorizedError } from '@zeina-tickethub/common';
import { Order, OrderDoc } from '../models/order';

// Every per-order route (show / cancel / refund / payout-now) opens the same way:
// load the order with its ticket populated — the ticket carries price, eventDate
// and the seller, which those routes all need — then prove the caller owns it.
// 404 for a missing order, 401 for someone else's.
export const loadOwnedOrder = async (req: Request): Promise<OrderDoc> => {
	const order = await Order.findById(req.params.orderId).populate('ticket');

	if (!order) {
		throw new NotFoundError();
	}
	if (order.userId !== req.currentUser!.id) {
		throw new NotAuthorizedError();
	}

	return order;
};
