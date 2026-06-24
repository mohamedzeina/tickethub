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
import { TicketRef } from '../../models/ticket-ref';
import { Pass } from '../../models/pass';

export class PaymentCreatedListener extends Listener<PaymentCreatedEvent> {
	readonly subject = Subjects.PaymentCreated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: PaymentCreatedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const order = await OrderRef.findById(data.orderId);

			// payment:created can race ahead of order:created; throw to retry until
			// the replica exists rather than minting against a missing buyer/ticket.
			if (!order) {
				throw new Error('OrderRef not found');
			}

			order.set({ status: OrderStatus.Complete });
			await order.save();

			// Mint one admission pass per seat (#10). The compound unique index on
			// (orderId, seat) plus the swallowed 11000 make redelivery / a concurrent
			// delivery a no-op. Venue/date are best-effort from the ticket replica;
			// passes are still valid without them.
			const ticketRef = await TicketRef.findById(order.ticketId);
			const seats = order.quantity ?? 1;
			for (let seat = 1; seat <= seats; seat++) {
				const pass = Pass.build({
					orderId: data.orderId,
					seat,
					buyerId: order.buyerId,
					ticketId: order.ticketId,
					eventTitle: order.ticketTitle,
					venue: ticketRef?.venue,
					eventDate: ticketRef?.eventDate,
				});
				try {
					await pass.save();
				} catch (err: any) {
					// 11000 = this seat's pass already exists. Benign.
					if (err?.code !== 11000) {
						throw err;
					}
				}
			}
		});

		msg.ack();
	}
}
