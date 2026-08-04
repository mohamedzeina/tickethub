import {
	PaymentCreatedEvent,
	Subjects,
	OrderStatus,
	sendMail,
	purchaseReceiptEmail,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { NotificationListener } from './base';
import { eventKey, hasOtherSeller, notify, requireOrder } from './helpers';
import { NotificationType } from '../../models/notification';

export class PaymentCreatedListener extends NotificationListener<PaymentCreatedEvent> {
	readonly subject = Subjects.PaymentCreated;

	protected async handleEvent(data: PaymentCreatedEvent['data'], msg: JsMsg) {
		const order = await requireOrder(data.orderId);

		// Mark paid so a late expiry warning/complete doesn't notify the buyer.
		order.set({ status: OrderStatus.Complete });
		await order.save();

		await notify({
			userId: order.userId,
			type: NotificationType.PaymentSucceeded,
			title: 'Payment confirmed',
			body: `You're in — your payment for "${order.ticketTitle}" went through. Your receipt is on its way by email.`,
			orderId: data.orderId,
			dedupeKey: eventKey(this.subject, msg, order.userId),
		});

		// Multi-seat (#10): amounts are per-seat price times seats sold.
		const qty = order.quantity ?? 1;
		const total = (order.price ?? 0) * qty;
		const seatsLabel = qty > 1 ? ` (${qty} seats)` : '';

		// Tell the SELLER their ticket sold (#11).
		if (hasOtherSeller(order)) {
			await notify({
				userId: order.sellerId,
				type: NotificationType.TicketSold,
				title: 'Your ticket sold!',
				body: `"${order.ticketTitle}"${seatsLabel} just sold for €${total.toFixed(2)}. We'll pay out your share after the refund window — track it in Account → Payouts.`,
				orderId: data.orderId,
				// Keyed on the SELLER: this row's recipient. Reusing the buyer's
				// key would collide with the row above and silently drop it.
				dedupeKey: eventKey(this.subject, msg, order.sellerId),
			});
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
					quantity: qty,
					orderId: order.id,
					stripeId: data.stripeId,
				}),
			);
		}
	}
}
