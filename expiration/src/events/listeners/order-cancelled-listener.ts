import { Listener, OrderCancelledEvent, Subjects, logger } from '@zeina-tickethub/common';
import Queue from 'bull';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { expirationQueue } from '../../queues/expiration-queue';
import { warningQueue } from '../../queues/warning-queue';
import { redisDeadLetterStore } from '../dead-letter-store';

// Best-effort removal of a delayed job keyed by orderId. A no-op if the job
// already ran or never existed; a job that's mid-execution can't be removed
// (locked) — that's harmless, since the orders status guard still prevents a
// double seat-release.
const dropJob = async (queue: Queue.Queue, orderId: string, label: string) => {
	try {
		const job = await queue.getJob(orderId);
		if (job) {
			await job.remove();
			logger.info({ orderId }, `dropped pending ${label} job for cancelled order`);
		}
	} catch (err) {
		logger.warn({ err, orderId }, `could not drop ${label} job`);
	}
};

// An order was cancelled (a manually released hold, an expiry, or a refund)
// before its timer lapsed. The pending expiry + warning jobs are now obsolete —
// drop them so a stale expiration:complete/warning doesn't fire minutes later
// and trigger a false "hold released" notification (#10). Jobs are keyed by
// orderId in order-created-listener.
export class OrderCancelledListener extends Listener<OrderCancelledEvent> {
	readonly subject = Subjects.OrderCancelled;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = redisDeadLetterStore;

	async onMessage(data: OrderCancelledEvent['data'], msg: JsMsg) {
		await dropJob(expirationQueue, data.id, 'expiration');
		await dropJob(warningQueue, data.id, 'warning');
		msg.ack();
	}
}
