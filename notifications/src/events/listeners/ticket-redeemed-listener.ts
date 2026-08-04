import { TicketRedeemedEvent, Subjects } from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { NotificationListener } from './base';
import { eventKey, notify } from './helpers';
import { Order } from '../../models/order';
import { NotificationType } from '../../models/notification';

// A buyer's admission pass was scanned and redeemed at the gate (admission
// service). Confirm check-in to the buyer — reassuring on entry, and a flag if
// they didn't expect it (someone else used their pass).
export class TicketRedeemedListener extends NotificationListener<TicketRedeemedEvent> {
	readonly subject = Subjects.TicketRedeemed;

	protected async handleEvent(data: TicketRedeemedEvent['data'], msg: JsMsg) {
		const order = await Order.findById(data.orderId);
		const title = order?.ticketTitle || 'your event';

		await notify({
			userId: data.buyerId,
			type: NotificationType.PassScanned,
			title: 'Pass scanned',
			body: `Your pass for "${title}" was scanned at the gate. You're checked in — enjoy the show! If this wasn't you, contact support.`,
			orderId: data.orderId,
			dedupeKey: eventKey(this.subject, msg, data.buyerId),
		});
	}
}
