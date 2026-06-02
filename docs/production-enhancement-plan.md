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

**D1. Structured logging.** Add `pino` + `pino-http` to each service (replace
`console.log`); include service name, request id, and event ids; JSON to stdout.

**D2. Metrics.** Add `prom-client` + a `/metrics` endpoint per service (default +
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

- [ ] Phase A — Reliability & infra hardening
- [ ] Phase B — Event-driven robustness
- [ ] Phase C — Payments done properly
- [ ] Phase D — Observability
