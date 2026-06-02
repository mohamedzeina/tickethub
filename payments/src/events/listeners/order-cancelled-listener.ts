import {
	Listener,
	OrderCancelledEvent,
	OrderStatus,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';

import { queueGroupName } from './queue-group-name';
import { Message } from 'node-nats-streaming';
import { Order } from '../../models/order';
import { ProcessedEvent } from '../../models/processed-event';

export class OrderCancelledListener extends Listener<OrderCancelledEvent> {
	readonly subject = Subjects.OrderCancelled;
	queueGroupName: string = queueGroupName;

	async onMessage(data: OrderCancelledEvent['data'], msg: Message) {
		await processOnce(
			ProcessedEvent,
			this.subject,
			msg.getSequence(),
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
