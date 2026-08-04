import {
	PaymentRefundedEvent,
	Subjects,
	sendMail,
	refundEmail,
} from '@zeina-tickethub/common';
import { NotificationListener } from './base';
import { hasOtherSeller, notify, requireOrder } from './helpers';
import { NotificationType } from '../../models/notification';

export class PaymentRefundedListener extends NotificationListener<PaymentRefundedEvent> {
	readonly subject = Subjects.PaymentRefunded;

	protected async handleEvent(data: PaymentRefundedEvent['data']) {
		const order = await requireOrder(data.orderId);

		await notify({
			userId: order.userId,
			type: NotificationType.PaymentRefunded,
			title: 'Refund issued',
			body: `Your payment for "${order.ticketTitle}" has been refunded. It may take a few days to appear on your statement.`,
			orderId: data.orderId,
		});

		// Tell the SELLER their sale was reversed (#11) — their ticket is
		// relisted and they won't be paid out for it.
		if (hasOtherSeller(order)) {
			await notify({
				userId: order.sellerId,
				type: NotificationType.SaleRefunded,
				title: 'A sale was refunded',
				body: `The buyer of "${order.ticketTitle}" was refunded, so that sale won't be paid out. Your ticket has been relisted.`,
				orderId: data.orderId,
			});
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
	}
}
