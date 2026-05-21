import {
	Listener,
	OrderCreatedEvent,
	OrderStatus,
	Subjects,
} from '@zeina-tickethub/common';
import { queueGroupName } from './queue-group-name';
import { Message } from 'node-nats-streaming';
import { expirationQueue } from '../../queues/expiration-queue';

export class OrderCreatedListener extends Listener<OrderCreatedEvent> {
	readonly subject = Subjects.OrderCreated;
	queueGroupName: string = queueGroupName;

	async onMessage(data: OrderCreatedEvent['data'], msg: Message) {
		await expirationQueue.add({
			orderId: data.id,
		});

		msg.ack();
	}
}
