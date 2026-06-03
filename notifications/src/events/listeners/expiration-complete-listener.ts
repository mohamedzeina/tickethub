import {
	Listener,
	ExpirationCompleteEvent,
	Subjects,
	OrderStatus,
	processOnce,
	logger,
	sendMail,
	orderCancelledEmail,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Order } from '../../models/order';
import { Notification, NotificationType } from '../../models/notification';

// A hold lapsed. orders cancels it only if still unpaid; mirror that here so a
// buyer who paid in the final seconds doesn't get a false "released" message.
export class ExpirationCompleteListener extends Listener<ExpirationCompleteEvent> {
	readonly subject = Subjects.ExpirationComplete;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: ExpirationCompleteEvent['data'], msg: JsMsg) {
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
					'skipping hold-expired notification (order already resolved)',
				);
				return;
			}

			order.set({ status: OrderStatus.Cancelled });
			await order.save();

			const notification = Notification.build({
				userId: order.userId,
				type: NotificationType.HoldExpired,
				title: 'Hold released',
				body: `Your hold on "${order.ticketTitle}" expired before payment, so the seat was released. It may still be available — search again to grab it.`,
				orderId: order.id,
			});
			await notification.save();

			// Centralized "hold expired" email (was in orders). Best-effort.
			if (order.userEmail) {
				await sendMail(
					orderCancelledEmail({
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
