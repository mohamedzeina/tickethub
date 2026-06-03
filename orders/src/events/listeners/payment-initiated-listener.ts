import {
	Listener,
	PaymentInitiatedEvent,
	Subjects,
	OrderStatus,
	processOnce,
} from '@zeina-tickethub/common';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { JsMsg } from 'nats';
import { Order } from '../../models/order';
import { ProcessedEvent } from '../../models/processed-event';

export class PaymentInitiatedListener extends Listener<PaymentInitiatedEvent> {
	readonly subject = Subjects.PaymentInitiated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: PaymentInitiatedEvent['data'], msg: JsMsg) {
		await processOnce(
			ProcessedEvent,
			this.subject,
			msg.seq,
			async () => {
				const order = await Order.findById(data.orderId);

				if (!order) {
					throw new Error('Order not found');
				}

				// Only nudge a fresh order forward. If it's already complete,
				// cancelled, or awaiting, leave it — never walk a status backwards.
				if (order.status === OrderStatus.Created) {
					order.set({ status: OrderStatus.AwaitingPayment });
					await order.save();
				}
			},
		);

		msg.ack();
	}
}
