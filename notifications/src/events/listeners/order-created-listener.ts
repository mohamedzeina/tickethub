import { OrderCreatedEvent, Subjects } from '@zeina-tickethub/common';
import { NotificationListener } from './base';
import { notify } from './helpers';
import { Order } from '../../models/order';
import { NotificationType } from '../../models/notification';

export class OrderCreatedListener extends NotificationListener<OrderCreatedEvent> {
	readonly subject = Subjects.OrderCreated;

	protected async handleEvent(data: OrderCreatedEvent['data']) {
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
		await order.save();

		await notify({
			userId: data.userId,
			type: NotificationType.OrderCreated,
			title: 'Reservation placed',
			body: `Your hold on "${data.ticket.title}" is set. Complete payment before it expires to lock in your seat.`,
			orderId: data.id,
		});
	}
}
