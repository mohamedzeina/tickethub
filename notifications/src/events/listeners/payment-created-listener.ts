import {
	Listener,
	PaymentCreatedEvent,
	Subjects,
	OrderStatus,
	processOnce,
	sendMail,
	purchaseReceiptEmail,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Order } from '../../models/order';
import { Notification, NotificationType } from '../../models/notification';

export class PaymentCreatedListener extends Listener<PaymentCreatedEvent> {
	readonly subject = Subjects.PaymentCreated;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: PaymentCreatedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const order = await Order.findById(data.orderId);

			// payment:created can race ahead of order:created; throw to retry until
			// the replica exists rather than dropping the notification.
			if (!order) {
				throw new Error('Order not found');
			}

			// Mark paid so a late expiry warning/complete doesn't notify the buyer.
			order.set({ status: OrderStatus.Complete });
			await order.save();

			const notification = Notification.build({
				userId: order.userId,
				type: NotificationType.PaymentSucceeded,
				title: 'Payment confirmed',
				body: `You're in — your payment for "${order.ticketTitle}" went through. Your receipt is on its way by email.`,
				orderId: data.orderId,
			});
			await notification.save();

			// Tell the SELLER their ticket sold (#11). Skip for pre-#11 orders with
			// no sellerId, and guard the (impossible) self-buy.
			if (order.sellerId && order.sellerId !== order.userId) {
				await Notification.build({
					userId: order.sellerId,
					type: NotificationType.TicketSold,
					title: 'Your ticket sold! 🎟️',
					body: `"${order.ticketTitle}" just sold for €${(order.price ?? 0).toFixed(2)}. We'll pay out your share after the refund window — track it in Account → Payouts.`,
					orderId: data.orderId,
				}).save();
			}

			// Centralized receipt email (was in payments). Best-effort — sendMail
			// never throws, and it's the last step so a DB failure above can't
			// leave a sent email un-recorded. Skip if we never saw the email.
			if (order.userEmail) {
				await sendMail(
					purchaseReceiptEmail({
						to: order.userEmail,
						ticketTitle: order.ticketTitle || 'your ticket',
						price: order.price ?? 0,
						orderId: order.id,
						stripeId: data.stripeId,
					}),
				);
			}
		});

		msg.ack();
	}
}
