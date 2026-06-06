import {
	Listener,
	PayoutProcessedEvent,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Order } from '../../models/order';
import { Notification, NotificationType } from '../../models/notification';

// A seller's payout settled (paid) or is being held (#11). Notify the seller.
// 'held' and 'paid' arrive as separate events (distinct seq), so a sale can
// legitimately produce a "held" then later a "paid" notification.
export class PayoutProcessedListener extends Listener<PayoutProcessedEvent> {
	readonly subject = Subjects.PayoutProcessed;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: PayoutProcessedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const order = await Order.findById(data.orderId);
			const title = order?.ticketTitle || 'your sale';
			const amount = `€${data.net.toFixed(2)}`;

			const copy =
				data.status === 'paid'
					? {
							type: NotificationType.PayoutPaid,
							title: 'Payout sent',
							body: `${amount} for "${title}" has been paid out to your connected account.`,
					  }
					: {
							type: NotificationType.PayoutHeld,
							title: 'Earnings waiting',
							body: `${amount} from "${title}" is being held. Set up payouts in Account → Payouts to collect it.`,
					  };

			await Notification.build({
				userId: data.sellerId,
				type: copy.type,
				title: copy.title,
				body: copy.body,
				orderId: data.orderId,
			}).save();
		});

		msg.ack();
	}
}
