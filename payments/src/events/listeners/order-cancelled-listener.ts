import {
	Listener,
	OrderCancelledEvent,
	OrderStatus,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';

import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { JsMsg } from 'nats';
import { Order } from '../../models/order';
import { ProcessedEvent } from '../../models/processed-event';

export class OrderCancelledListener extends Listener<OrderCancelledEvent> {
	readonly subject = Subjects.OrderCancelled;
	queueGroupName: string = queueGroupName;
	// B3: cap retries and dead-letter poison messages.
	protected deadLetterStore = FailedEvent;

	async onMessage(data: OrderCancelledEvent['data'], msg: JsMsg) {
		await processOnce(
			ProcessedEvent,
			this.subject,
			msg.seq,
			async () => {
				// Match by id only (not version - 1): the AwaitingPayment transition
				// bumps the order's version in the orders service without notifying
				// payments, so the replica can lag by a version. Cancel is terminal
				// and idempotent, and processOnce already guards against redelivery.
				const order = await Order.findById(data.id);

				if (!order) {
					throw new Error('Order not found');
				}

				if (order.status !== OrderStatus.Cancelled) {
					order.set({ status: OrderStatus.Cancelled });
					await order.save();
				}

				// Refunds no longer run here. A buyer refund is an explicit,
				// window-gated action (order:refund:requested) confirmed by the
				// Stripe webhook — see order-refund-requested-listener.ts. This
				// listener only mirrors the cancellation into the local replica.
			},
		);

		msg.ack();
	}
}
