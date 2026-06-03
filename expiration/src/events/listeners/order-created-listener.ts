import {
	Listener,
	OrderCreatedEvent,
	Subjects,
	logger,
} from '@zeina-tickethub/common';
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

		logger.info({ orderId: data.id, delayMs: delay }, 'scheduling order expiration');

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
