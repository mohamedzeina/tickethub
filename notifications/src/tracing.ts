// OpenTelemetry bootstrap. This MUST be imported before express/mongoose/http so
// the auto-instrumentations can patch those modules at require time — hence it is
// the very first import in index.ts. Spans export over OTLP/HTTP to Jaeger; NATS
// context propagation is handled in common's publisher/listener.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
	resource: resourceFromAttributes({
		[ATTR_SERVICE_NAME]: process.env.SERVICE_NAME ?? 'tickethub',
	}),
	traceExporter: new OTLPTraceExporter({
		url:
			process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
			'http://jaeger-srv:4318/v1/traces',
	}),
	instrumentations: [
		getNodeAutoInstrumentations({
			// fs spans are pure noise for a web service.
			'@opentelemetry/instrumentation-fs': { enabled: false },
		}),
	],
});

sdk.start();

// No signal handler here — index.ts owns graceful shutdown, and a second
// SIGTERM listener calling process.exit would race it. The BatchSpanProcessor
// flushes on its own interval; a few in-flight spans on shutdown are acceptable.
