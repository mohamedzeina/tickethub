import mongoose from 'mongoose';
import { JsMsg } from 'nats';
import { Pass, PassStatus } from '../models/pass';

// Shared unit-test fixtures.

// A fresh Mongo id as a hex string — cross-service ids are Strings here.
export const oid = () => new mongoose.Types.ObjectId().toHexString();

// The only bits of a JetStream message a listener touches: `seq` (the dedup key)
// and `ack` (which the tests spy on). Cast rather than build a full JsMsg.
export const msg = (seq: number) =>
	({ ack: jest.fn(), seq }) as unknown as JsMsg;

// A saved pass with sane defaults; override any attribute (including `status`,
// which is set after build since it isn't a build attr).
export const buildPass = async ({
	status,
	...overrides
}: Record<string, any> = {}) => {
	const pass = Pass.build({
		orderId: oid(),
		buyerId: oid(),
		ticketId: oid(),
		eventTitle: 'Coldplay',
		venue: 'Wembley',
		...overrides,
	});
	if (status && status !== PassStatus.Issued) pass.set({ status });
	await pass.save();
	return pass;
};
