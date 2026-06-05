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

			// Mint the admission pass — once. The unique index on orderId plus this
			// guard make a redelivery a no-op. Venue/date are best-effort from the
			// ticket replica; the pass is still valid without them.
			const existing = await Pass.findOne({ orderId: data.orderId });
			if (!existing) {
				const ticketRef = await TicketRef.findById(order.ticketId);
				const pass = Pass.build({
					orderId: data.orderId,
					buyerId: order.buyerId,
					ticketId: order.ticketId,
					eventTitle: order.ticketTitle,
					venue: ticketRef?.venue,
					eventDate: ticketRef?.eventDate,
				});
				try {
					await pass.save();
				} catch (err: any) {
					// 11000 = a concurrent delivery already minted it. Benign.
					if (err?.code !== 11000) {
						throw err;
					}
				}
			}
		});

		msg.ack();
	}
}
