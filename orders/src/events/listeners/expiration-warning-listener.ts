import {
	Listener,
	ExpirationWarningEvent,
	Subjects,
	OrderStatus,
	processOnce,
	sendMail,
	holdExpiringEmail,
	logger,
} from '@zeina-tickethub/common';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { JsMsg } from 'nats';
import { Order } from '../../models/order';
import { ProcessedEvent } from '../../models/processed-event';

// 5b: a hold is about to expire. Only nudge the buyer if the order is still
// unpaid — if they already paid (Complete) or it was cancelled, stay quiet.
export class ExpirationWarningListener extends Listener<ExpirationWarningEvent> {
	readonly subject = Subjects.ExpirationWarning;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: ExpirationWarningEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const order = await Order.findById(data.orderId).populate('ticket');

			if (!order) {
				throw new Error('Order not found');
			}

			const stillHolding =
				order.status === OrderStatus.Created ||
				order.status === OrderStatus.AwaitingPayment;

			if (stillHolding && order.userEmail) {
				await sendMail(
					holdExpiringEmail({
						to: order.userEmail,
						ticketTitle: order.ticket.title,
						orderId: order.id,
					}),
				);
			} else {
				logger.info(
					{ orderId: order.id, status: order.status },
					'skipping expiry warning (order no longer holding)',
				);
			}
		});

		msg.ack();
	}
}
