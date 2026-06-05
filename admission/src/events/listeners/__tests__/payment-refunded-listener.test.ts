import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { PaymentRefundedListener } from '../payment-refunded-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Pass, PassStatus } from '../../../models/pass';

const buildPass = async (orderId: string, status: PassStatus = PassStatus.Issued) => {
	const pass = Pass.build({
		orderId,
		buyerId: 'b',
		ticketId: 't',
		eventTitle: 'Coldplay',
	});
	if (status !== PassStatus.Issued) pass.set({ status });
	await pass.save();
	return pass;
};

const msg = (seq: number) => ({ ack: jest.fn(), seq }) as unknown as JsMsg;

it('revokes an issued pass when the order is refunded', async () => {
	const orderId = new mongoose.Types.ObjectId().toHexString();
	await buildPass(orderId);
	const listener = new PaymentRefundedListener(natsWrapper.connection);

	await listener.onMessage({ id: 'pay', orderId, stripeId: 'pi_1' } as any, msg(1));

	const pass = await Pass.findOne({ orderId });
	expect(pass!.status).toBe('revoked');
});

it('leaves an already-redeemed pass untouched', async () => {
	const orderId = new mongoose.Types.ObjectId().toHexString();
	await buildPass(orderId, PassStatus.Redeemed);
	const listener = new PaymentRefundedListener(natsWrapper.connection);

	await listener.onMessage({ id: 'pay', orderId, stripeId: 'pi_1' } as any, msg(1));

	const pass = await Pass.findOne({ orderId });
	expect(pass!.status).toBe('redeemed');
});
