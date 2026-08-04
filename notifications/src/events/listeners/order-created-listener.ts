import { OrderCreatedEvent, Subjects } from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { NotificationListener } from './base';
import { eventKey, notify } from './helpers';
import { Order } from '../../models/order';
import { NotificationType } from '../../models/notification';
import { isDuplicateKey } from '../../is-duplicate-key';

export class OrderCreatedListener extends NotificationListener<OrderCreatedEvent> {
	readonly subject = Subjects.OrderCreated;

	protected async handleEvent(data: OrderCreatedEvent['data'], msg: JsMsg) {
		// Seed the local order replica so payment/expiration events (which only
		// carry an orderId) can resolve the buyer + title later.
		const order = Order.build({
			id: data.id,
			userId: data.userId,
			ticketTitle: data.ticket.title,
			status: data.status,
			userEmail: data.userEmail,
			price: data.ticket.price,
			quantity: data.quantity,
			sellerId: data.sellerId,
		});

		try {
			await order.save();
		} catch (err) {
			// The replica is keyed on the order's own id, so a redelivery (the
			// notify below having failed first time round) collides on `_id`.
			// Swallow that and carry on rather than upserting: the row is already
			// there with these exact fields, and an upsert would let a replay
			// stamp `status: Created` back over a status the payment/expiration
			// handlers have since moved on. notify() dedupes on its own key.
			if (!isDuplicateKey(err)) {
				throw err;
			}
		}

		await notify({
			userId: data.userId,
			type: NotificationType.OrderCreated,
			title: 'Reservation placed',
			body: `Your hold on "${data.ticket.title}" is set. Complete payment before it expires to lock in your seat.`,
			orderId: data.id,
			dedupeKey: eventKey(this.subject, msg, data.userId),
		});
	}
}
