jest.mock('@zeina-tickethub/common', () => ({
	...jest.requireActual('@zeina-tickethub/common'),
	sendMail: jest.fn(),
}));

import { UserVerificationRequestedEvent, sendMail } from '@zeina-tickethub/common';
import { UserVerificationRequestedListener } from '../user-verification-requested-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { msg } from '../../../test/helpers';

const setup = (seq = 1) => {
	const listener = new UserVerificationRequestedListener(natsWrapper.connection);
	const data: UserVerificationRequestedEvent['data'] = {
		email: 'new@test.com',
		token: 'rawtoken123',
	};
	return { listener, data, msg: msg(seq) };
};

beforeEach(() => {
	process.env.CLIENT_URL = 'https://example.test';
});

it('sends a verification email with the token link and acks', async () => {
	const { listener, data, msg } = setup();
	await listener.onMessage(data, msg);

	expect(sendMail).toHaveBeenCalledTimes(1);
	const sent = (sendMail as jest.Mock).mock.calls[0][0];
	expect(sent.to).toEqual('new@test.com');
	expect(sent.html).toContain(
		'https://example.test/auth/verify-email?token=rawtoken123',
	);
	expect(msg.ack).toHaveBeenCalled();
});
