import {
	Listener,
	PaymentCreatedEvent,
	Subjects,
	OrderStatus,
	processOnce,
} from '@zeina-tickethub/common';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { JsMsg } from 'nats';
import { Order } from '../../models/order';
import { ProcessedEvent } from '../../models/processed-event';

export class PaymentCreatedListener extends Listener<PaymentCreatedEvent> {
	readonly subject = Subjects.PaymentCreated;
	queueGroupName: string = queueGroupName;
	// B3: cap retries and dead-letter poison messages.
	protected deadLetterStore = FailedEvent;

	async onMessage(data: PaymentCreatedEvent['data'], msg: JsMsg) {
		await processOnce(
			ProcessedEvent,
			this.subject,
			msg.seq,
			async () => {
				const order = await Order.findById(data.orderId);

				if (!order) {
					throw new Error('Order not found');
				}

				// If the order was already cancelled (e.g. it expired right as the
				// payment landed), don't complete it — the payments service refunds
				// the charge off order:cancelled. Record it as handled and move on.
				if (order.status === OrderStatus.Cancelled) {
					return;
				}

				// C5: stamp the receipt metadata so the order detail / history
				// page can show a real receipt (Stripe reference + paid-at).
				order.set({
					status: OrderStatus.Complete,
					stripeId: data.stripeId,
					paidAt: new Date(),
				});

				await order.save();
			},
		);

		msg.ack();
	}
}
