import {
	Listener,
	ExpirationCompleteEvent,
	Subjects,
	OrderStatus,
	processOnce,
} from '@zeina-tickethub/common';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { Message } from 'node-nats-streaming';
import { Order } from '../../models/order';
import { ProcessedEvent } from '../../models/processed-event';
import { OrderCancelledPublisher } from '../publishers/order-cancelled-publisher';

export class ExpirationCompleteListener extends Listener<ExpirationCompleteEvent> {
	readonly subject = Subjects.ExpirationComplete;
	queueGroupName: string = queueGroupName;
	// B3: cap retries and dead-letter poison messages.
	protected deadLetterStore = FailedEvent;

	async onMessage(data: ExpirationCompleteEvent['data'], msg: Message) {
		await processOnce(
			ProcessedEvent,
			this.subject,
			msg.getSequence(),
			async () => {
				const order = await Order.findById(data.orderId).populate('ticket');

				if (!order) {
					throw new Error('Order not found');
				}

				// Already paid for — leave it alone, but record it as handled so
				// we don't re-check on redelivery.
				if (order.status === OrderStatus.Complete) {
					return;
				}

				order.set({
					status: OrderStatus.Cancelled,
				});

				await order.save();

				await new OrderCancelledPublisher(this.client).publish({
					id: order.id,
					version: order.version,
					ticket: {
						id: order.ticket.id,
					},
				});
			},
		);

		msg.ack();
	}
}
