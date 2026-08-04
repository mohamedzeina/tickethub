jest.mock('@zeina-tickethub/common', () => ({
	...jest.requireActual('@zeina-tickethub/common'),
	sendMail: jest.fn(),
}));

import { PasswordResetRequestedEvent, sendMail } from '@zeina-tickethub/common';
import { PasswordResetRequestedListener } from '../password-reset-requested-listener';
import { natsWrapper } from '../../../nats-wrapper';
import { msg } from '../../../test/helpers';

const setup = (seq = 1) => {
	const listener = new PasswordResetRequestedListener(natsWrapper.connection);
	const data: PasswordResetRequestedEvent['data'] = {
		email: 'forgot@test.com',
		token: 'resettoken456',
	};
	return { listener, data, msg: msg(seq) };
};

beforeEach(() => {
	process.env.CLIENT_URL = 'https://example.test';
});

it('sends a reset email with the token link and acks', async () => {
	const { listener, data, msg } = setup();
	await listener.onMessage(data, msg);

	expect(sendMail).toHaveBeenCalledTimes(1);
	const sent = (sendMail as jest.Mock).mock.calls[0][0];
	expect(sent.to).toEqual('forgot@test.com');
	expect(sent.html).toContain(
		'https://example.test/auth/reset-password?token=resettoken456',
	);
	expect(msg.ack).toHaveBeenCalled();
});
