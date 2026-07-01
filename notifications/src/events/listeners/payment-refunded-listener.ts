import {
	Listener,
	PaymentRefundedEvent,
	Subjects,
	processOnce,
	sendMail,
	refundEmail,
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

			// Tell the SELLER their sale was reversed (#11) — their ticket is
			// relisted and they won't be paid out for it.
			if (order.sellerId && order.sellerId !== order.userId) {
				await Notification.build({
					userId: order.sellerId,
					type: NotificationType.SaleRefunded,
					title: 'A sale was refunded',
					body: `The buyer of "${order.ticketTitle}" was refunded, so that sale won't be paid out. Your ticket has been relisted.`,
					orderId: data.orderId,
				}).save();
			}

			// Centralized refund confirmation email. Best-effort — sendMail never
			// throws, and it's the last step so a DB failure above can't leave a
			// sent email un-recorded. Skip if we never saw the buyer's email.
			if (order.userEmail) {
				await sendMail(
					refundEmail({
						to: order.userEmail,
						ticketTitle: order.ticketTitle || 'your ticket',
						orderId: order.id,
						price: order.price,
						quantity: order.quantity ?? 1,
						stripeId: data.stripeId,
					}),
				);
			}
		});

		msg.ack();
	}
}
