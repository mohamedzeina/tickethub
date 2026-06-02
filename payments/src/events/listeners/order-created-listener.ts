import {
	Listener,
	OrderCreatedEvent,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { Message } from 'node-nats-streaming';
import { Order } from '../../models/order';
import { ProcessedEvent } from '../../models/processed-event';

export class OrderCreatedListener extends Listener<OrderCreatedEvent> {
	readonly subject = Subjects.OrderCreated;
	queueGroupName: string = queueGroupName;
	// B3: cap retries and dead-letter poison messages.
	protected deadLetterStore = FailedEvent;

	async onMessage(data: OrderCreatedEvent['data'], msg: Message) {
		await processOnce(
			ProcessedEvent,
			this.subject,
			msg.getSequence(),
			async () => {
				const order = await Order.build({
					id: data.id,
					version: data.version,
					userId: data.userId,
					status: data.status,
					price: data.ticket.price,
				});

				await order.save();
			},
		);

		msg.ack();
	}
}
