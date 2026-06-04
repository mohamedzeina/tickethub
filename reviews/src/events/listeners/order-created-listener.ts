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
import { TicketRef } from '../../models/ticket-ref';
import { OrderRef } from '../../models/order-ref';

export class OrderCreatedListener extends Listener<OrderCreatedEvent> {
	readonly subject = Subjects.OrderCreated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: OrderCreatedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			// Resolve the seller for this order from the ticket replica. order:created
			// carries no seller id, so if ticket:created hasn't landed yet we throw
			// to retry rather than guess — a listing always exists before an order on
			// it, so this resolves on a redelivery at worst.
			const ticketRef = await TicketRef.findById(data.ticket.id);
			if (!ticketRef) {
				throw new Error('TicketRef not found for order');
			}

			const order = OrderRef.build({
				id: data.id,
				buyerId: data.userId,
				sellerId: ticketRef.sellerId,
				ticketId: data.ticket.id,
				ticketTitle: data.ticket.title,
				status: data.status,
			});
			await order.save();
		});

		msg.ack();
	}
}
