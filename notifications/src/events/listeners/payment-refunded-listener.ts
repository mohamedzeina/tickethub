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
import { Order } from '../../models/order';
import { Notification, NotificationType } from '../../models/notification';

export class PaymentRefundedListener extends Listener<PaymentRefundedEvent> {
	readonly subject = Subjects.PaymentRefunded;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: PaymentRefundedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const order = await Order.findById(data.orderId);

			if (!order) {
				throw new Error('Order not found');
			}

			const notification = Notification.build({
				userId: order.userId,
				type: NotificationType.PaymentRefunded,
				title: 'Refund issued',
				body: `Your payment for "${order.ticketTitle}" has been refunded. It may take a few days to appear on your statement.`,
				orderId: data.orderId,
			});
			await notification.save();
		});

		msg.ack();
	}
}
