import { logger } from '@zeina-tickethub/common';
import { ExpirationWarningPublisher } from '../events/publishers/expiration-warning-publisher';
import { natsWrapper } from '../nats-wrapper';
import { makeQueue } from './make-queue';

// Separate delayed queue that fires a configurable lead time *before* the hold
// expires (scheduled alongside the expiry job). It just emits the warning event;
// orders decides whether the order is still unpaid and worth emailing. (#5b)
const warningQueue = makeQueue('order:warning');

warningQueue.process(async (job) => {
	// The warning is a nice-to-have nudge — never let a publish failure crash
	// the worker (which also runs the critical expiry job). Log and move on.
	try {
		await new ExpirationWarningPublisher(natsWrapper.js).publish({
			orderId: job.data.orderId,
		});
	} catch (err) {
		logger.error(
			{ err, orderId: job.data.orderId },
			'failed to publish expiration warning',
		);
	}
});

export { warningQueue };
