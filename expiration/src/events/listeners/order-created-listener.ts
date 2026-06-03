import {
	Listener,
	OrderCreatedEvent,
	Subjects,
	logger,
} from '@zeina-tickethub/common';
import { queueGroupName } from './queue-group-name';
import { JsMsg } from 'nats';
import { expirationQueue } from '../../queues/expiration-queue';
import { warningQueue } from '../../queues/warning-queue';
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

		// 5b: schedule a "hold expiring soon" warning a lead time before expiry.
		// Skip it when the hold is too short for a warning to make sense (delay
		// would be in the past).
		const leadMs =
			parseInt(process.env.EXPIRATION_WARNING_LEAD_SECONDS || '120', 10) * 1000;
		const warningDelay = delay - leadMs;
		if (warningDelay > 0) {
			logger.info(
				{ orderId: data.id, warningDelayMs: warningDelay },
				'scheduling expiration warning',
			);
			await warningQueue.add({ orderId: data.id }, { delay: warningDelay });
		}

		msg.ack();
	}
}
