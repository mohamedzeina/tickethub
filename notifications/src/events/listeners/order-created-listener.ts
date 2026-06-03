import {
	Listener,
	OrderCreatedEvent,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Order } from '../../models/order';
import { Notification, NotificationType } from '../../models/notification';

export class OrderCreatedListener extends Listener<OrderCreatedEvent> {
	readonly subject = Subjects.OrderCreated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: OrderCreatedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			// Seed the local order replica so payment/expiration events (which only
			// carry an orderId) can resolve the buyer + title later.
			const order = Order.build({
				id: data.id,
				userId: data.userId,
				ticketTitle: data.ticket.title,
				status: data.status,
			});
			await order.save();

			const notification = Notification.build({
				userId: data.userId,
				type: NotificationType.OrderCreated,
				title: 'Reservation placed',
				body: `Your hold on "${data.ticket.title}" is set. Complete payment before it expires to lock in your seat.`,
				orderId: data.id,
			});
			await notification.save();
		});

		msg.ack();
	}
}
