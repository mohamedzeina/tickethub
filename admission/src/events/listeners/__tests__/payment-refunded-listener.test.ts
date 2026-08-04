import { PaymentRefundedListener } from '../payment-refunded-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { Pass, PassStatus } from '../../../models/pass';
import { oid, msg, buildPass } from '../../../test/helpers';

it('revokes an issued pass when the order is refunded', async () => {
	const orderId = oid();
	await buildPass({ orderId });
	const listener = new PaymentRefundedListener(natsWrapper.connection);

	await listener.onMessage({ id: 'pay', orderId, stripeId: 'pi_1' } as any, msg(1));

	const pass = await Pass.findOne({ orderId });
	expect(pass!.status).toBe('revoked');
});

it('leaves an already-redeemed pass untouched', async () => {
	const orderId = oid();
	await buildPass({ orderId, status: PassStatus.Redeemed });
	const listener = new PaymentRefundedListener(natsWrapper.connection);

	await listener.onMessage({ id: 'pay', orderId, stripeId: 'pi_1' } as any, msg(1));

	const pass = await Pass.findOne({ orderId });
	expect(pass!.status).toBe('redeemed');
});
