import {
	ExpirationWarningEvent,
	Subjects,
	logger,
	sendMail,
	holdExpiringEmail,
} from '@zeina-tickethub/common';
import { NotificationListener } from './base';
import { notify, requireOrder, stillHolding } from './helpers';
import { NotificationType } from '../../models/notification';

// A hold is about to expire. Only notify if the order is still unpaid — once
// it's Complete (or already Cancelled) the warning is noise.
export class ExpirationWarningListener extends NotificationListener<ExpirationWarningEvent> {
	readonly subject = Subjects.ExpirationWarning;

	protected async handleEvent(data: ExpirationWarningEvent['data']) {
		const order = await requireOrder(data.orderId);

		if (!stillHolding(order)) {
			logger.info(
				{ orderId: order.id, status: order.status },
				'skipping expiry-warning notification (order no longer holding)',
			);
			return;
		}

		await notify({
			userId: order.userId,
			type: NotificationType.HoldExpiring,
			title: 'Hold expiring soon',
			body: `Your hold on "${order.ticketTitle}" is about to expire. Complete payment now to keep your seat.`,
			orderId: order.id,
		});

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
	}
}
