import {
	Listener,
	ExpirationCompleteEvent,
	Subjects,
	OrderStatus,
	processOnce,
} from '@zeina-tickethub/common';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { JsMsg } from 'nats';
import { Order } from '../../models/order';
import { Ticket } from '../../models/ticket';
import { ProcessedEvent } from '../../models/processed-event';
import { OrderCancelledPublisher } from '../publishers/order-cancelled-publisher';

export class ExpirationCompleteListener extends Listener<ExpirationCompleteEvent> {
	readonly subject = Subjects.ExpirationComplete;
	queueGroupName: string = queueGroupName;
	// B3: cap retries and dead-letter poison messages.
	protected deadLetterStore = FailedEvent;

	async onMessage(data: ExpirationCompleteEvent['data'], msg: JsMsg) {
		await processOnce(
			ProcessedEvent,
			this.subject,
			msg.seq,
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

				// Only an active hold (Created/AwaitingPayment) still occupies seats.
				// If it was already cancelled, releasing again would over-credit the
				// listing — skip it (#10).
				if (
					order.status !== OrderStatus.Created &&
					order.status !== OrderStatus.AwaitingPayment
				) {
					return;
				}

				order.set({
					status: OrderStatus.Cancelled,
				});

				await order.save();

				// Return the held seats to the listing's pool.
				await Ticket.releaseSeats(order.ticket.id, order.quantity);

				await new OrderCancelledPublisher(this.js).publish({
					id: order.id,
					version: order.version,
					quantity: order.quantity,
					ticket: {
						id: order.ticket.id,
					},
				});

				// The "hold expired" email is now sent by the notifications
				// service off expiration:complete (centralized comms, #6).
			},
		);

		msg.ack();
	}
}
