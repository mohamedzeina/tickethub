import {
	Listener,
	TicketCreatedEvent,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { TicketRef } from '../../models/ticket-ref';

export class TicketCreatedListener extends Listener<TicketCreatedEvent> {
	readonly subject = Subjects.TicketCreated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: TicketCreatedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			// Record the ticket -> seller mapping so order:created can resolve the
			// seller for an order placed on this ticket.
			const ticketRef = TicketRef.build({
				id: data.id,
				sellerId: data.userId,
				title: data.title,
			});
			await ticketRef.save();
		});

		msg.ack();
	}
}
