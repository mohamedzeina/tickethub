import { Message } from 'node-nats-streaming';
import { Listener } from '../../../common/src/events/base-listener';
import { TicketCreatedEvent } from '../../../common/src/events/ticket/created';
import { Subjects } from '../../../common/src/events/subjects';

export class TicketCreatedListener extends Listener<TicketCreatedEvent> {
	readonly subject = Subjects.TicketCreated;
	queueGroupName = 'payment-service';

	onMessage(data: TicketCreatedEvent['data'], msg: Message) {
		console.log('Event data:', data);

		msg.ack();
	}
}
