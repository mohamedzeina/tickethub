import mongoose from 'mongoose';
import { JsMsg } from 'nats';

// A fresh Mongo id as a hex string — cross-service ids are Strings here, so this
// is the shape every userId / ticketId / orderId in a test wants.
export const oid = () => new mongoose.Types.ObjectId().toHexString();

// A stand-in for a JetStream message. Listeners only ever touch ack() and seq,
// so a double cast is enough — and honest, unlike a @ts-ignore'd object literal
// that claims to be a full JsMsg.
export const fakeMsg = (seq = 1) =>
	({ ack: jest.fn(), seq }) as unknown as JsMsg;
