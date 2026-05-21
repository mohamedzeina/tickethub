import {
	Listener,
	ExpirationCompleteEvent,
	Subjects,
	OrderStatus,
} from '@zeina-tickethub/common';
import { queueGroupName } from './queue-group-name';
import { Message } from 'node-nats-streaming';
import { Order } from '../../models/order';

export class ExpirationCompleteListener extends Listener<ExpirationCompleteEvent> {
	readonly subject = Subjects.ExpirationComplete;
	queueGroupName: string = queueGroupName;

	async onMessage(data: ExpirationCompleteEvent['data'], msg: Message) {
		const order = Order.findById(data.orderId);

		if (!order) {
			throw new Error('Order not found');
		}

		order.set({
			status: OrderStatus.Cancelled,
		});
	}
}
