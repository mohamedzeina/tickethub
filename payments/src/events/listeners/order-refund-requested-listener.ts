import {
	Listener,
	OrderRefundRequestedEvent,
	Subjects,
	processOnce,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Payment } from '../../models/payment';
import { Refund } from '../../models/refund';
import { stripe } from '../../stripe';
import { isDuplicateKey } from '../../is-duplicate-key';

// A buyer asked to refund a completed order (gated by the orders service). We
// create the Stripe refund and record it as PENDING — we do NOT announce success
// here. payment:refunded is published only once Stripe's charge.refunded webhook
// confirms the money actually moved (see routes/webhook.ts).
export class OrderRefundRequestedListener extends Listener<OrderRefundRequestedEvent> {
	readonly subject = Subjects.OrderRefundRequested;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: OrderRefundRequestedEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const orderId = data.id;

			const payment = await Payment.findOne({ orderId });
			if (!payment) {
				// Not paid (or replica lag) — nothing to refund. The orders service
				// only emits this for a Complete order, so this is a no-op guard.
				return;
			}

			// Already handled this order's refund — don't double-create.
			const existing = await Refund.findOne({ orderId });
			if (existing) {
				return;
			}

			// idempotencyKey makes a redelivered request a no-op at Stripe.
			const refund = await stripe.refunds.create(
				{ payment_intent: payment.stripeId },
				{ idempotencyKey: `refund_${orderId}` },
			);

			try {
				await Refund.build({
					orderId,
					stripeId: payment.stripeId,
					refundId: refund.id,
					amount: (refund.amount ?? 0) / 100,
					status: 'pending',
				}).save();
			} catch (err: any) {
				// A concurrent delivery already recorded it. Benign.
				if (!isDuplicateKey(err)) {
					throw err;
				}
			}
		});

		msg.ack();
	}
}
