# TicketHub — Production-Maturity Enhancement Plan

## Context

TicketHub is a Stephen Grider–style microservices demo (auth, tickets, orders,
payments, expiration, client + shared `common` lib over NATS Streaming, Mongo-per-
service). Goal: **enhance the existing demo to look and behave production-grade and
to learn the real patterns** — *not* a rewrite and *not* a real paying product.

Verdict from the architecture review: the **decomposition is sound and stays as-is**
(the services are the pedagogical point). What's missing is **maturity**. This plan
hardens it across four independent, individually-shippable phases. Recommended order
A → B → C → D; each phase is its own PR (or a few).

Cross-cutting note: several items touch `common` (`@zeina-tickethub/common`). Any
`common` change = bump version once, `npm publish`, and update **all** services to the
same version (today they drift: 1.0.20 / 1.0.30 / 1.0.32 — pin them in Phase A).

---

## Phase A — Reliability & infra hardening (Low–Med, foundational)

**A1. Health endpoints + k8s probes.** Add `GET /healthz` (liveness) and `/readyz`
(readiness = `mongoose.connection.readyState === 1` && NATS connected) to each Express
service (`auth|tickets|orders|payments/src/app.ts`). `expiration` has no HTTP server —
add a tiny `http` server exposing `/healthz`. Add a shared `healthRouter()` to `common`
to avoid drift. Wire `livenessProbe`/`readinessProbe` (httpGet) into every
`infra/k8s/*-depl.yaml`.

**A2. Graceful shutdown.** In each `src/index.ts`, capture `const server = app.listen(...)`
and on SIGTERM/SIGINT: `server.close()` → `natsWrapper.client.close()` (already done) →
`mongoose.disconnect()` → `process.exit(0)`, with a timeout. Add `terminationGracePeriodSeconds`
+ a `preStop` sleep so the pod leaves the Service endpoints before draining.

**A3. Persist NATS + Redis (fixes a real bug).** Today `nats-depl.yaml` stores to an
in-pod dir (`-SD`) and `expiration-redis-depl.yaml` has no persistence → **a pod restart
silently drops scheduled order expirations**. Give both a PVC (StatefulSet or Deployment+PVC);
enable Redis AOF. (If Phase B migrates to JetStream, the NATS half is superseded.)

**A4. Resources, replicas, HPA.** Add `resources.requests/limits` to every deployment;
set `replicas: 2` for the stateless HTTP services + `client` (keep `expiration` at 1 to
avoid duplicate job publishing); add an `autoscaling/v2` HPA on CPU for the HTTP services
(needs metrics-server). Optional PodDisruptionBudgets.

**A5. Production Dockerfiles.** Convert each service to multi-stage: builder runs
`npm ci && npm run build` (add `tsc` build + `outDir: dist`), runtime is pinned
`node:20-alpine`, `USER node`, `CMD ["node","dist/index.js"]` (replaces dev
`ts-node-dev`). Client: `next build` + `next start` (consider `output: 'standalone'`).

**A6. Pin `common`.** Align all services to one `@zeina-tickethub/common` version.

---

## Phase B — Event-driven robustness (Med)

**B1. Idempotent consumers.** At-least-once delivery + no dedup today. Add a
`processedEvents` collection (unique on `{channel, sequence}` using `msg.getSequence()`)
per consuming service; on each message, upsert-or-skip before applying side effects.
Replica updates are already version-ordered (`findByEvent`); this protects the
*action* listeners (`payment-created` → complete, `expiration-complete` → cancel).

**B2. Graceful version-conflict / error handling in listeners.** Wrap `onMessage` so
`VersionError`/out-of-order events log structured context and **don't ack** (let
redelivery retry) instead of throwing raw. Centralize in the `common` base-listener.

**B3. Dead-letter handling.** Use `msg.getRedeliveryCount()`; after N attempts, persist
to a `deadLetters` collection (or a `dead-letter` subject) + ack, so poison messages
can't loop forever. Add a metric/alert hook (ties into Phase D).

**B4. (Larger, recommended) NATS Streaming → JetStream.** `nats-streaming:0.17.0` is
**EOL**. Migrate to NATS 2.x JetStream via the `nats` SDK: rewrite `common`’s
`base-listener.ts`/`base-publisher.ts` + each service’s `nats-wrapper.ts`, swap
`infra/k8s/nats-depl.yaml`. Gains durable consumers, native dedup (`Nats-Msg-Id`), and
persistence (subsumes A3-NATS). Biggest single item — can be deferred but it’s the most
credible ecosystem upgrade.

---

## Phase C — Payments done properly (Med)

**C1. Charges → PaymentIntents.** Replace `stripe.charges.create` in
`payments/src/routes/new.ts` with a PaymentIntent flow (server creates intent → returns
`client_secret` → client confirms via Stripe.js). Update the client checkout in
`client/pages/orders/[orderId].js` (already uses Stripe Elements) to `confirmPayment`.
Set the order to the (currently dead) `AwaitingPayment` state when the intent is created.

**C2. Idempotency keys.** Pass `{ idempotencyKey: orderId }` to Stripe to prevent
double-charge on retry/refresh.

**C3. Webhooks = source of truth.** Add `POST /api/payments/webhook`
(`stripe.webhooks.constructEvent`, raw-body parser, webhook secret). On
`payment_intent.succeeded` → create `Payment` + publish `payment:created` (no longer
trust the synchronous response). Fixes the "crash between charge and DB write" gap.

**C4. Refunds (closes backlog #8).** payments listens to `order:cancelled`; if a Payment
exists, `stripe.refunds.create` + publish a new `payment:refunded` subject (add to
`common`); orders transitions accordingly. Removes the "money taken, no ticket" hole.

**C5. Receipt/history (closes backlog #4).** Persist `stripeId` + `paidAt` on the order
via the `payment:created` consumer; render a real receipt on the order detail/history page.

---

## Phase D — Observability (Med, the demo showpiece)

**D1. Structured logging.** ✅ Done. Add `pino` + `pino-http` to each service (replace
`console.log`); include service name, request id, and event ids; JSON to stdout.

**D2. Metrics.** ✅ Done. Add `prom-client` + a `/metrics` endpoint per service (default +
custom: orders created, payments succeeded/failed, events processed, redelivery count).
Deploy Prometheus + Grafana manifests under `infra/k8s/` scraping `/metrics` and the NATS
monitoring port (8222); add Grafana dashboards.

**D3. Distributed tracing.** OpenTelemetry SDK auto-instrumenting Express/Mongoose/NATS,
exporting to an OTel collector → Jaeger/Tempo. Propagate trace context across NATS by
injecting/extracting headers in `common`’s publisher/listener — yields end-to-end traces
of the order → payment → expiration flow.

**D4. (Optional) Alerting.** Prometheus AlertManager rules (payment failure rate,
listener redelivery spikes).

---

## Files (representative, not exhaustive)

- **common:** `src/events/base-listener.ts`, `base-publisher.ts`, `subjects.ts`,
  `src/index.ts` (+ new `health-router.ts`, dead-letter/idempotency helpers, OTel context).
- **per service:** `src/index.ts` (shutdown/health), `src/app.ts` (health routes, pino),
  `src/nats-wrapper.ts` (JetStream), `Dockerfile`, `package.json` (build script).
- **payments:** `src/routes/new.ts`, new `src/routes/webhook.ts`, `src/stripe.ts`,
  `src/models/payment.ts`; client `pages/orders/[orderId].js`.
- **expiration:** `src/queues/expiration-queue.ts` (Redis persistence/retry).
- **infra/k8s:** every `*-depl.yaml` (probes/resources/replicas), `nats-depl.yaml`,
  `expiration-redis-depl.yaml`, `ingress-srv.yaml` (+ TLS later), new `hpa-*.yaml`,
  `prometheus-*.yaml`, `grafana-*.yaml`, `otel-collector.yaml`.
- **CI:** `.github/workflows/*` (add build+push with SHA tags; an integration test).

## Verification

- **Per service:** existing `npm run test:ci` stays green after each phase; add tests for
  new behavior (idempotency dedup, refund flow, webhook handler, health routes).
- **A:** `skaffold dev`; `kubectl get pods` shows 2 replicas + Ready from probes; kill a
  NATS/Redis pod and confirm a pending expiration still fires (A3).
- **B:** redeliver a duplicate event (or restart a consumer mid-batch) → exactly-once side
  effect; force a poison message → lands in dead-letter after N tries.
- **C:** Stripe test cards through PaymentIntents; double-submit → one charge (idempotency);
  cancel a paid order → refund issued; webhook replay is safe.
- **D:** Grafana shows per-service metrics; a single checkout produces one end-to-end trace
  across orders→payments→expiration in Jaeger.
- **End-to-end:** seed (`seed/seed.js`), then run the buy→hold→expire and buy→pay→complete
  flows in the browser via the ingress.

## Suggested execution

One phase per PR, in order A → B → C → D. Within a phase, group by service. Start with
**A1–A2 + A4** (cheapest, most visible), then A3/A5, then proceed. B4 (JetStream) and
D3 (tracing) are the two largest items — schedule them as their own PRs.

---

## Status / progress

_(check off as we go — start here tomorrow)_

**2026-06-03 — D2 (metrics) done; common 1.0.42.** Shared `prom-client` registry in
`common` (`metrics.ts`): default node/process metrics, `service` default label,
`httpMetrics` middleware (`http_requests_total` + `http_request_duration_seconds`
histogram, labelled by route *template* so order ids don't blow up cardinality),
`metricsRouter()` (`GET /metrics`) for the Express services, and `renderMetrics()`
for expiration's raw-http server. Event counters live in `common`'s
publisher/listener: `events_published_total{subject}`,
`events_processed_total{subject,queue_group,result=success|retry|dead_letter}`,
`event_redeliveries_total{subject,queue_group}`. Domain counters:
`orders_created_total` (orders/new), `payments_succeeded_total` /
`payments_failed_total` (payments webhook). Re-exported `client` so services
declare counters without their own dep. k8s: `prometheus.io/scrape` annotations on
all 5 service pods; `monitoring-prometheus.yaml` (RBAC + pod-discovery scrape +
emptyDir), `monitoring-nats-exporter.yaml` (translates NATS :8222 JSON →
Prometheus :7777), `monitoring-grafana.yaml` (provisioned Prometheus datasource +
TicketHub Overview dashboard, anonymous viewing). Tested: 116 unit tests green
(auth 12 / tickets 52 / orders 37 / payments 15); **live in-cluster** — e2e flow
11/11, all **11 Prometheus targets up**, custom metrics queryable
(orders_created, http_requests_total by service, events_published/processed by
subject/result, redeliveries, gnatsd_varz_connections), and Grafana → Prometheus
proxy returns live data with the dashboard provisioned. Grafana/Prometheus are
viewable via `kubectl port-forward svc/grafana-srv 3001:3000` /
`svc/prometheus-srv 9090:9090` (no ingress host wired yet).

**2026-06-03 — D1 (structured logging) done; common 1.0.41.** Shared `pino` logger
in `common` (`logger` + `requestLogger`), service name from `SERVICE_NAME` (set per
depl), level `silent` under test / `info` otherwise, JSON to stdout. `requestLogger`
(pino-http) logs one line per request with a request id (reuses inbound
`x-request-id`, else generates one), demotes `/healthz` + `/readyz` to debug, and
bumps 4xx→warn / 5xx→error. Replaced every `console.*` across all 5 services +
common's base-listener/publisher/error-handler with structured `logger` calls
(event logs carry `subject`; expiration carries `orderId`+`delayMs`). Wired
`SERVICE_NAME` into all 5 depl yamls. Tested: auth 12 / tickets 52 / orders 37 /
payments 15 unit tests green (orders' base-listener test now spies on `logger`);
**live e2e — 11/11 checks** through the ingress (reserve → own-ticket block →
already-reserved block → pay-intent → AwaitingPayment → cancel → cancelled),
confirmed JSON logs with `service` + request ids + event subjects on all five
services, no probe-log noise, no error-level logs.

- [x] Phase A — Reliability & infra hardening (A1–A6 done, tested in-cluster)
- [x] Phase B — Event-driven robustness (B1–B4 done, verified in-cluster on common 1.0.37)
- [x] Phase C — Payments done properly (C1–C5 + AwaitingPayment, verified in-cluster on common 1.0.39)
- [ ] Phase D — Observability (D1 logging + D2 metrics done; D3–D4 pending)

**2026-06-03 — C5 (receipt/history) done; closes backlog #4.** orders now persists
`stripeId` + `paidAt` on the order when `payment:created` completes it. The order
detail page renders a real receipt (Paid stamp, amount, paid-at, Stripe ref, order
no.) for completed orders instead of the checkout gate, and the order history page
shows a paid date + "View receipt" link. No `common` change. Tested: orders 37/37
unit tests; live e2e — pay an order, then GET returns stripeId + paidAt and the
receipt page + history render correctly. **Phase C complete.**

**2026-06-03 — AwaitingPayment + C4 (refunds) done; common 1.0.39.** Added two
`common` subjects: `payment:initiated` (payments → orders) and `payment:refunded`.
AwaitingPayment: the create-intent route publishes `payment:initiated`; a new
orders listener moves Created → AwaitingPayment (never walks a status backwards).
C4 refunds: payments' `order:cancelled` listener now refunds the charge
(`stripe.refunds.create`, idempotency-keyed on the order) when a Payment exists
and publishes `payment:refunded`; orders' `payment:created` listener no longer
completes an already-cancelled order. Fixed a latent issue introduced by
AwaitingPayment — it bumps the order version in orders without notifying payments,
so payments' `order:cancelled` replica sync switched from `version-1` matching to
id-based + idempotent (processOnce already dedups). `ensureStream` now `update()`s
the existing stream's subject list so the two new subjects are captured.
Pinned all 5 services to `^1.0.39`.
Tested: payments 15/15 + orders 36/36 unit tests; **live e2e** — order goes
`awaiting:payment` after create-intent, and cancelling a paid order issues a real
Stripe refund ($175 `succeeded`) and lands the order in `cancelled`.
Note: `common`'s `clean` script was `del ./build/*` (del-cli ESM error skipped
tsc, publishing a stale 1.0.38) — switched to `rm -rf ./build`; 1.0.38 is a dud,
use 1.0.39.

**2026-06-03 — C1–C3 done (synchronous-first, then webhook conversion).**
C1: `stripe.charges.create` → PaymentIntents. C2: `idempotencyKey: orderId` so a
double-submit replays one PaymentIntent. C3: webhook as source of truth — the
`POST /api/payments` route now creates a PaymentIntent and returns its
`client_secret`; the client confirms with `confirmCardPayment`; a new
`POST /api/payments/webhook` (raw-body, `constructEvent` signature check, mounted
before `json()`) records the `Payment` + publishes `payment:created` only on
`payment_intent.succeeded`, idempotent on the intent id. Closes the
"crash between charge and DB write" gap. Wired `STRIPE_WEBHOOK_SECRET` into
`payments-depl.yaml` ← `stripe-secret`.
Tested: 13 payments unit tests (route returns client_secret/records nothing;
webhook 400-on-bad-sig / records+publishes / idempotent) + a **live webhook e2e**
through `stripe listen` — real `payment_intent.succeeded` delivered to the cluster
([200]), order goes `complete`.
**Deferred:** the `AwaitingPayment` order state — it needs a new `common` event
(payments → orders) → a `common` bump + npm publish + all-services update, the same
cross-cutting change C4's `payment:refunded` subject needs. Batch them together.

**2026-06-02 — B4 done: NATS Streaming → JetStream.** Swapped the EOL
`nats-streaming:0.17.0` + `node-nats-streaming` for `nats:2.10-alpine` (JetStream)
+ the `nats` SDK. `common`'s base-publisher/base-listener rewritten: one `tickethub`
stream (file storage on the PVC) over the 6 subjects, and **pull consumers** (one
durable per service+subject, 9 total) that load-balance across replicas. Robustness
now leans on JetStream natives — the retry cap is the consumer's `max_deliver` and a
poison message is `term()`'d after the delivery cap (the hand-rolled B3 attempt
counter is retired; a thin `FailedEvent`/Redis store is kept for inspection/replay).
B1 `processedevents` stays for exactly-once *effects* (keyed on `msg.seq`).
Migration cleanup: switching brokers reset the message-sequence space, so the
STAN-era `processedevents`/`failedevents` rows had to be cleared once (their old
sequences collided with JetStream's fresh ones). Re-ran the full Phase A + B e2e on
JetStream: **38 checks, all green.**

**2026-06-02 — combined Phase A + B e2e: 38 checks, all green** (live `docker-desktop`
cluster via the ingress). Covered: health endpoints + liveness/readiness probes;
graceful-shutdown config (preStop + SIGTERM handlers); 2 replicas for the HTTP
services + HPAs + resource requests/limits; NATS & Redis PVCs bound with Redis AOF —
**a scheduled order expiration survives a Redis pod restart** (the A3 bug fix);
idempotent consumers (`processedevents` recording + unique-index dedup guard);
graceful listener errors with no service crash through a retry storm; and a **poison
message dead-lettered after 10 attempts** then acked so it stops looping (per-consumer —
the same event is processed fine by the non-poisoned service). App flows exercised
end-to-end: reserve → blocked-while-reserved → cancel → unreserve, and buy → pay →
complete.

**2026-06-02 — combined Phase A + B e2e: 38 checks, all green** (live `docker-desktop`
cluster via the ingress). Covered: health endpoints + liveness/readiness probes;
graceful-shutdown config (preStop + SIGTERM handlers); 2 replicas for the HTTP
services + HPAs + resource requests/limits; NATS & Redis PVCs bound with Redis AOF —
**a scheduled order expiration survives a Redis pod restart** (the A3 bug fix);
idempotent consumers (`processedevents` recording + unique-index dedup guard);
graceful listener errors with no service crash through a retry storm; and a **poison
message dead-lettered after 10 attempts** then acked so it stops looping (per-consumer —
the same event is processed fine by the non-poisoned service). App flows exercised
end-to-end: reserve → blocked-while-reserved → cancel → unreserve, and buy → pay →
complete. B4 (NATS Streaming → JetStream) remains the one open Phase B item.
