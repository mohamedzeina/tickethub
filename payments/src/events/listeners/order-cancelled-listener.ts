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
				const order = await Order.findOne({
					_id: data.id,
					version: data.version - 1,
				});

				if (!order) {
					throw new Error('Order not found');
				}

				order.set({ status: OrderStatus.Cancelled });
				await order.save();
			},
		);

		msg.ack();
	}
}
