import {
	Listener,
	PaymentRefundedEvent,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Pass, PassStatus } from '../../models/pass';

export class PaymentRefundedListener extends Listener<PaymentRefundedEvent> {
	readonly subject = Subjects.PaymentRefunded;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: PaymentRefundedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			// A refunded ticket must stop working at the gate. Revoke every
			// still-issued pass for the order (#10 — an order can have several) — an
			// already-redeemed pass means that seat attended, so a refund in that
			// (shouldn't-happen) case leaves the used record be.
			await Pass.updateMany(
				{ orderId: data.orderId, status: PassStatus.Issued },
				{ $set: { status: PassStatus.Revoked } },
			);
		});

		msg.ack();
	}
}
