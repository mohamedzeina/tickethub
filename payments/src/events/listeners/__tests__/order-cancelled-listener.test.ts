import { OrderCancelledEvent, OrderStatus } from '@zeina-tickethub/common';
import { OrderCancelledListener } from '../order-cancelled-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Order } from '../../../models/order';
import { Payment } from '../../../models/payment';
import { stripe } from '../../../stripe';
import mongoose from 'mongoose';

const setup = async () => {
	const listener = new OrderCancelledListener(natsWrapper.connection);

	const order = await Order.build({
		id: new mongoose.Types.ObjectId().toHexString(),
		version: 0,
		userId: 'asfafssf',
		status: OrderStatus.Created,
		price: 20,
	});

	await order.save();

	const data: OrderCancelledEvent['data'] = {
		id: order.id,
		version: 1,
		ticket: {
			id: 'asafalkfn',
		},
	};

	// @ts-ignore
	const msg: JsMsg = {
		ack: jest.fn(),
		seq: 1,
	};

	return { listener, data, msg, order };
};

it('updates the status of the order', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	const updatedOrder = await Order.findById(data.id);

	expect(updatedOrder!.status).toEqual(OrderStatus.Cancelled);
});

it('acks the message', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	expect(msg.ack).toHaveBeenCalled();
});

it('cancels the order only once for a redelivered (duplicate) event', async () => {
	const { listener, data, msg, order } = await setup();

	await listener.onMessage(data, msg);
	await listener.onMessage(data, msg);

	const updatedOrder = await Order.findById(data.id);
	expect(updatedOrder!.status).toEqual(OrderStatus.Cancelled);
	// Version bumped only on the first delivery.
	expect(updatedOrder!.version).toEqual(order.version + 1);
	expect(msg.ack).toHaveBeenCalledTimes(2);
});

it('does not refund or publish when the cancelled order was never paid', async () => {
	const { listener, data, msg } = await setup();

	await listener.onMessage(data, msg);

	// No Payment for this order → no payment:refunded event.
	expect(natsWrapper.js.publish).not.toHaveBeenCalled();
});

it('refunds the charge and publishes payment:refunded when the order was paid', async () => {
	const { listener, data, msg } = await setup();

	// A real, succeeded PaymentIntent that the listener will refund.
	const paymentIntent = await stripe.paymentIntents.create({
		amount: 2000,
		currency: 'usd',
		payment_method: 'pm_card_visa',
		confirm: true,
		automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
	});

	const payment = Payment.build({ orderId: data.id, stripeId: paymentIntent.id });
	await payment.save();

	await listener.onMessage(data, msg);

	// Stripe issued a refund against the intent...
	const refunds = await stripe.refunds.list({
		payment_intent: paymentIntent.id,
	});
	expect(refunds.data.length).toBeGreaterThan(0);

	// ...and we announced it.
	expect(natsWrapper.js.publish).toHaveBeenCalledTimes(1);
});
