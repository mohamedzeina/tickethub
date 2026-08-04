import { ExpirationCompletePublisher } from '../events/publishers/expiration-complete-publisher';
import { natsWrapper } from '../nats-wrapper';
import { makeQueue } from './make-queue';

const expirationQueue = makeQueue('order:expiration');

expirationQueue.process(async (job) => {
	// Await it: this is the critical seat-release path, so a publish failure must
	// fail the job and let Bull retry. (Unawaited, Bull marked the job complete
	// before the publish settled and the order was never expired.)
	await new ExpirationCompletePublisher(natsWrapper.js).publish({
		orderId: job.data.orderId,
	});
});

export { expirationQueue };
