import {
	Listener,
	OrderPayoutDueEvent,
	Subjects,
	processOnce,
	isDuplicateKey,
} from '@zeina-tickethub/common';
import { JsMsg } from 'nats';
import { queueGroupName } from './queue-group-name';
import { FailedEvent } from '../../models/failed-event';
import { ProcessedEvent } from '../../models/processed-event';
import { Payment } from '../../models/payment';
import { Payout } from '../../models/payout';
import {
	computeFeeCents,
	attemptTransfer,
	announcePayout,
} from '../../services/payouts';

// #11 payouts. An order has cleared its refund window (orders emits this once).
// Record a Payout (one per order, unique orderId) and attempt the Stripe transfer
// of the seller's share. If the seller hasn't connected yet, it's held as
// pending_account and released later when they connect.
export class OrderPayoutDueListener extends Listener<OrderPayoutDueEvent> {
	readonly subject = Subjects.OrderPayoutDue;
	queueGroupName: string = queueGroupName;
	protected deadLetterStore = FailedEvent;

	async onMessage(data: OrderPayoutDueEvent['data'], msg: JsMsg) {
		await processOnce(ProcessedEvent, this.subject, msg.seq, async () => {
			const { orderId, sellerId, amount } = data;

			// One payout per order — a redelivery / sweep retry finds it and stops.
			if (await Payout.findOne({ orderId })) {
				return;
			}

			const amountCents = Math.round(amount * 100);
			const fee = computeFeeCents(amountCents) / 100;

			// Charge behind the sale → source_transaction on the transfer.
			const payment = await Payment.findOne({ orderId });

			let payout;
			try {
				payout = Payout.build({
					orderId,
					sellerId,
					amount,
					fee,
					chargeId: payment?.chargeId,
					status: 'pending_account',
				});
				await payout.save();
			} catch (err: any) {
				// Concurrent delivery already created it (unique orderId). Benign.
				if (isDuplicateKey(err)) return;
				throw err;
			}

			// Pay the seller now if their account is ready; otherwise it stays held.
			await attemptTransfer(payout);

			// Notify the seller of the first terminal state. attemptTransfer already
			// announced 'paid'; here we announce 'held' for a still-unconnected
			// seller (a failed transfer stays quiet — it retries on release).
			if (payout.status === 'pending_account') {
				await announcePayout(payout, 'held');
			}
		});

		msg.ack();
	}
}
