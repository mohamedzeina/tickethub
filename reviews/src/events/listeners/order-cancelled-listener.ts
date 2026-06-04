import {
	Listener,
	OrderCancelledEvent,
	Subjects,
	OrderStatus,
	processOnce,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { OrderRef } from '../../models/order-ref';

export class OrderCancelledListener extends Listener<OrderCancelledEvent> {
	readonly subject = Subjects.OrderCancelled;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: OrderCancelledEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const order = await OrderRef.findById(data.id);

			// A cancelled (incl. refunded) order is not reviewable. If we haven't
			// seen the order yet there's nothing to mark — cancellation of an order
			// we never replicated is a no-op.
			if (!order) {
				return;
			}

			order.set({ status: OrderStatus.Cancelled });
			await order.save();
		});

		msg.ack();
	}
}
