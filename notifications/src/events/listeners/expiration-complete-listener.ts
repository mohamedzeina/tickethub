import {
	ExpirationCompleteEvent,
	Subjects,
	OrderStatus,
	logger,
	sendMail,
	orderCancelledEmail,
} from '@zeina-tickethub/common';
import { NotificationListener } from './base';
import { notify, requireOrder, stillHolding } from './helpers';
import { NotificationType } from '../../models/notification';

// A hold lapsed. orders cancels it only if still unpaid; mirror that here so a
// buyer who paid in the final seconds doesn't get a false "released" message.
export class ExpirationCompleteListener extends NotificationListener<ExpirationCompleteEvent> {
	readonly subject = Subjects.ExpirationComplete;

	protected async handleEvent(data: ExpirationCompleteEvent['data']) {
		const order = await requireOrder(data.orderId);

		if (!stillHolding(order)) {
			logger.info(
				{ orderId: order.id, status: order.status },
				'skipping hold-expired notification (order already resolved)',
			);
			return;
		}

		order.set({ status: OrderStatus.Cancelled });
		await order.save();

		await notify({
			userId: order.userId,
			type: NotificationType.HoldExpired,
			title: 'Hold released',
			body: `Your hold on "${order.ticketTitle}" expired before payment, so the seat was released. It may still be available — search again to grab it.`,
			orderId: order.id,
		});

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
	}
}
