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

// The buyer's pass was scanned at the gate. Stamp redeemedAt so the order can no
// longer be refunded (you can't refund a ticket you've already used).
export class TicketRedeemedListener extends Listener<TicketRedeemedEvent> {
	readonly subject = Subjects.TicketRedeemed;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: TicketRedeemedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const order = await Order.findById(data.orderId);
			if (!order || order.redeemedAt) {
				return; // unknown order or already stamped — no-op
			}
			order.set({ redeemedAt: data.redeemedAt ? new Date(data.redeemedAt) : new Date() });
			await order.save();
		});

		msg.ack();
	}
}
