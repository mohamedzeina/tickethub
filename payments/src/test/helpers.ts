import mongoose from 'mongoose';
import { JsMsg } from 'nats';

// Shared unit-test fixtures.

// A fresh Mongo id as a hex string — cross-service ids are Strings here.
export const oid = () => new mongoose.Types.ObjectId().toHexString();

// The only bits of a JetStream message a listener touches: `seq` (the dedup key)
// and `ack` (which the tests spy on). Cast rather than build a full JsMsg.
export const msg = (seq: number) =>
	({ ack: jest.fn(), seq }) as unknown as JsMsg;
