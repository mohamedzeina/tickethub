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
import { OrderRef } from '../../models/order-ref';

export class OrderCreatedListener extends Listener<OrderCreatedEvent> {
	readonly subject = Subjects.OrderCreated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: OrderCreatedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			// Seed the order replica so a later payment:created can mint a pass for
			// the right buyer/ticket. Unlike reviews, admission needs no seller id,
			// so there's no TicketRef dependency here. Tolerate a dup _id so a stream
			// replay over an already-seeded order is a no-op rather than a poison loop.
			const order = OrderRef.build({
				id: data.id,
				buyerId: data.userId,
				ticketId: data.ticket.id,
				ticketTitle: data.ticket.title,
				status: data.status,
			});
			try {
				await order.save();
			} catch (err: any) {
				if (err?.code !== 11000) {
					throw err;
				}
			}
		});

		msg.ack();
	}
}
