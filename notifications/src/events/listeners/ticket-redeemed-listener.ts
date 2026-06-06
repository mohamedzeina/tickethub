import {
	Listener,
	TicketRedeemedEvent,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Order } from '../../models/order';
import { Notification, NotificationType } from '../../models/notification';

// A buyer's admission pass was scanned and redeemed at the gate (admission
// service). Confirm check-in to the buyer — reassuring on entry, and a flag if
// they didn't expect it (someone else used their pass).
export class TicketRedeemedListener extends Listener<TicketRedeemedEvent> {
	readonly subject = Subjects.TicketRedeemed;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: TicketRedeemedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const order = await Order.findById(data.orderId);
			const title = order?.ticketTitle || 'your event';

			await Notification.build({
				userId: data.buyerId,
				type: NotificationType.PassScanned,
				title: 'Pass scanned ✓',
				body: `Your pass for "${title}" was scanned at the gate. You're checked in — enjoy the show! If this wasn't you, contact support.`,
				orderId: data.orderId,
			}).save();
		});

		msg.ack();
	}
}
