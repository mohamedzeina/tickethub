import {
	Listener,
	ExpirationWarningEvent,
	Subjects,
	OrderStatus,
	processOnce,
	logger,
	sendMail,
	holdExpiringEmail,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Order } from '../../models/order';
import { Notification, NotificationType } from '../../models/notification';

// A hold is about to expire. Only notify if the order is still unpaid — once
// it's Complete (or already Cancelled) the warning is noise.
export class ExpirationWarningListener extends Listener<ExpirationWarningEvent> {
	readonly subject = Subjects.ExpirationWarning;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: ExpirationWarningEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const order = await Order.findById(data.orderId);

			if (!order) {
				throw new Error('Order not found');
			}

			const stillHolding =
				order.status === OrderStatus.Created ||
				order.status === OrderStatus.AwaitingPayment;

			if (!stillHolding) {
				logger.info(
					{ orderId: order.id, status: order.status },
					'skipping expiry-warning notification (order no longer holding)',
				);
				return;
			}

			const notification = Notification.build({
				userId: order.userId,
				type: NotificationType.HoldExpiring,
				title: 'Hold expiring soon',
				body: `Your hold on "${order.ticketTitle}" is about to expire. Complete payment now to keep your seat.`,
				orderId: order.id,
			});
			await notification.save();

			// Centralized "hold expiring" email (was in orders). Best-effort.
			if (order.userEmail) {
				await sendMail(
					holdExpiringEmail({
						to: order.userEmail,
						ticketTitle: order.ticketTitle,
						orderId: order.id,
					}),
				);
			}
		});

		msg.ack();
	}
}
