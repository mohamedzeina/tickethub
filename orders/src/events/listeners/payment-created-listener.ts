import {
	Listener,
	PaymentCreatedEvent,
	Subjects,
	OrderStatus,
	processOnce,
} from '@zeina-tickethub/common';
import { queueGroupName } from './queue-group-name';
import { Message } from 'node-nats-streaming';
import { Order } from '../../models/order';
import { ProcessedEvent } from '../../models/processed-event';

export class PaymentCreatedListener extends Listener<PaymentCreatedEvent> {
	readonly subject = Subjects.PaymentCreated;
	queueGroupName: string = queueGroupName;

	async onMessage(data: PaymentCreatedEvent['data'], msg: Message) {
		await processOnce(
			ProcessedEvent,
			this.subject,
			msg.getSequence(),
			async () => {
				const order = await Order.findById(data.orderId);

				if (!order) {
					throw new Error('Order not found');
				}

				order.set({
					status: OrderStatus.Complete,
				});

				await order.save();
			},
		);

		msg.ack();
	}
}
