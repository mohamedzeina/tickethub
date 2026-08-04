import { PayoutProcessedEvent, Subjects } from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { NotificationListener } from './base';
import { eventKey, notify } from './helpers';
import { Order } from '../../models/order';
import { NotificationType } from '../../models/notification';

// A seller's payout settled (paid) or is being held (#11). Notify the seller.
// 'held' and 'paid' arrive as separate events (distinct seq), so a sale can
// legitimately produce a "held" then later a "paid" notification.
export class PayoutProcessedListener extends NotificationListener<PayoutProcessedEvent> {
	readonly subject = Subjects.PayoutProcessed;

	protected async handleEvent(data: PayoutProcessedEvent['data'], msg: JsMsg) {
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

		await notify({
			userId: data.sellerId,
			type: copy.type,
			title: copy.title,
			body: copy.body,
			orderId: data.orderId,
			dedupeKey: eventKey(this.subject, msg, data.sellerId),
		});
	}
}
