import {
	Listener,
	PaymentCreatedEvent,
	Subjects,
	OrderStatus,
	processOnce,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { OrderRef } from '../../models/order-ref';

export class PaymentCreatedListener extends Listener<PaymentCreatedEvent> {
	readonly subject = Subjects.PaymentCreated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: PaymentCreatedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const order = await OrderRef.findById(data.orderId);

			// payment:created can race ahead of order:created; throw to retry until
			// the replica exists rather than dropping the completion that unlocks
			// reviewing.
			if (!order) {
				throw new Error('OrderRef not found');
			}

			// Completing the order is what makes it reviewable.
			order.set({ status: OrderStatus.Complete });
			await order.save();
		});

		msg.ack();
	}
}
