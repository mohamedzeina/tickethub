import {
	Listener,
	PaymentRefundedEvent,
	Subjects,
	OrderStatus,
	processOnce,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Order } from '../../models/order';
import { OrderCancelledPublisher } from '../publishers/order-cancelled-publisher';

// The refund settled (Stripe webhook confirmed). Flip the order to Refunded with
// its receipt metadata, then publish order:cancelled so the ticket is released
// back to sale and downstream services react (tickets relist, reviews hide).
export class PaymentRefundedListener extends Listener<PaymentRefundedEvent> {
	readonly subject = Subjects.PaymentRefunded;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: PaymentRefundedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const order = await Order.findById(data.orderId).populate('ticket');

			// payment:refunded can race the order replica; retry until it's here.
			if (!order) {
				throw new Error('Order not found');
			}

			if (order.status === OrderStatus.Refunded) {
				return; // already handled
			}

			order.set({
				status: OrderStatus.Refunded,
				refundedAt: new Date(),
				refundAmount: data.amount,
				stripeRefundId: data.refundId,
			});
			await order.save();

			// Release the seat + cascade (tickets relist, reviews soft-hide).
			await new OrderCancelledPublisher(this.js).publish({
				id: order.id,
				version: order.version,
				ticket: { id: order.ticket.id },
			});
		});

		msg.ack();
	}
}
