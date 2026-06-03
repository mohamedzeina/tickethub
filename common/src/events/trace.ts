import {
	context,
	propagation,
	trace,
	Context,
	Tracer,
} from '@opentelemetry/api';
import { headers as natsHeaders, MsgHdrs, JsMsg } from 'nats';

// auto-instrumentations don't trace the nats JetStream client, so we propagate
// W3C trace context across NATS by hand: the publisher injects the active
// context into message headers, the listener extracts it and re-roots its work
// under that context — stitching producer and consumer into one trace.

const TRACER_NAME = 'tickethub-events';

export const eventsTracer = (): Tracer => trace.getTracer(TRACER_NAME);

// OTel carriers are plain string maps; these adapters bridge to NATS MsgHdrs.
const setter = {
	set(carrier: MsgHdrs, key: string, value: string) {
		carrier.set(key, value);
	},
};

const getter = {
	keys(carrier: MsgHdrs): string[] {
		return [...carrier.keys()];
	},
	get(carrier: MsgHdrs, key: string): string | undefined {
		return carrier.has(key) ? carrier.get(key) : undefined;
	},
};

// Build NATS headers carrying the active trace context, for js.publish.
export const injectTraceHeaders = (): MsgHdrs => {
	const h = natsHeaders();
	propagation.inject(context.active(), h, setter);
	return h;
};

// Recover the parent context a message was published under (active context if
// the message carries no trace headers).
export const extractTraceContext = (m: JsMsg): Context => {
	if (!m.headers) return context.active();
	return propagation.extract(context.active(), m.headers, getter);
};
