import { Listener, OrderCreatedEvent, Subjects } from '@zeina-tickethub/common';
import { queueGroupName } from './queue-group-name';
import { JsMsg } from 'nats';
import { expirationQueue } from '../../queues/expiration-queue';
import { redisDeadLetterStore } from '../dead-letter-store';

export class OrderCreatedListener extends Listener<OrderCreatedEvent> {
	readonly subject = Subjects.OrderCreated;
	queueGroupName: string = queueGroupName;
	// B3: cap retries and dead-letter poison messages (Redis-backed).
	protected deadLetterStore = redisDeadLetterStore;

	async onMessage(data: OrderCreatedEvent['data'], msg: JsMsg) {
		const delay = new Date(data.expiresAt).getTime() - new Date().getTime();

		console.log('Order ', data.id, ' expiring in ', delay, ' milliseconds');

		await expirationQueue.add(
			{
				orderId: data.id,
			},
			{
				delay,
			},
		);

		msg.ack();
	}
}
