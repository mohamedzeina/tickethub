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
import { Payment } from '../../models/payment';
import { ProcessedEvent } from '../../models/processed-event';
import { stripe } from '../../stripe';
import { PaymentRefundedPublisher } from '../publishers/payment-refunded-publisher';

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

				// C4: if this order was paid, refund the charge and announce it.
				// The idempotency key makes a redelivered refund a no-op at Stripe.
				const payment = await Payment.findOne({ orderId: data.id });

				if (payment) {
					await stripe.refunds.create(
						{ payment_intent: payment.stripeId },
						{ idempotencyKey: `refund_${data.id}` },
					);

					await new PaymentRefundedPublisher(this.js).publish({
						id: payment.id,
						orderId: payment.orderId,
						stripeId: payment.stripeId,
					});
				}
			},
		);

		msg.ack();
	}
}
