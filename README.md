# TicketHub

A StubHub-style ticket marketplace built as a set of **Node.js microservices** on **Kubernetes**, communicating asynchronously over **NATS JetStream**. Users list event tickets for sale, reserve another seller's ticket (which locks it for a 15-minute payment window), and pay with Stripe; orders that aren't paid in time expire and release the ticket. Beyond the core marketplace, the project is hardened to production-grade: health probes and graceful shutdown, idempotent and dead-lettered event consumers, Stripe PaymentIntents with webhooks and refunds, and a full observability stack — **structured logging, Prometheus metrics, Grafana dashboards, OpenTelemetry tracing through Jaeger, and AlertManager**.

> This started as a Stephen Grider–style microservices demo and was deliberately matured into a production-shaped system. The full engineering record — decisions, trade-offs, and verification — lives in [docs/production-enhancements.md](docs/production-enhancements.md).

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Services](#services)
- [Event-Driven Flow](#event-driven-flow)
- [Production Engineering](#production-engineering)
- [Observability](#observability)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Running Locally](#running-locally)
- [Testing](#testing)

---

## Features

### Marketplace
- List a ticket for sale with title, price, event date, venue, description, category, and an uploaded image
- Edit or unlist your own tickets (an unlisted ticket can no longer be reserved)
- Browse and search the catalog; ticket detail pages with seller info
- Image uploads via Cloudinary with a signed-upload flow

### Buying & Reservations
- Reserve a ticket by creating an order — the ticket is locked while the order is active
- A reservation expires after a configurable window (default 15 min), releasing the ticket automatically
- "Can't buy your own ticket" and "already reserved" rules enforced across services
- Order lifecycle: `Created → AwaitingPayment → Complete`, or `Cancelled` / expired

### Payments
- Stripe **PaymentIntents** with the client confirming the card via Stripe.js
- **Webhook as source of truth** — a payment is only recorded once Stripe confirms `payment_intent.succeeded`
- **Idempotency keys** prevent double-charges on retry/refresh
- **Automatic refunds** when a paid order is cancelled
- Persisted receipts (Stripe reference, amount, paid-at) on the order detail and history pages

### Accounts
- Signup / signin with JWT issued in a cookie session
- Auth shared across services via a `currentUser` middleware in the shared library

---

## Architecture

TicketHub is composed of five backend services, a Next.js client, and a shared library, each owning its own MongoDB database. Services never call each other synchronously — they communicate by publishing and consuming events on **NATS JetStream**, so each service can fail, restart, and scale independently. An nginx ingress routes external traffic by path.

```
                              ┌────────────────────────┐
            tickethub.com ──▶ │   ingress-nginx        │
                              └────────────────────────┘
              /api/users │ /api/tickets │ /api/orders │ /api/payments │ /
                    ▼          ▼              ▼              ▼          ▼
                ┌──────┐   ┌────────┐    ┌────────┐    ┌──────────┐  ┌────────┐
                │ auth │   │tickets │    │ orders │    │ payments │  │ client │
                └──┬───┘   └───┬────┘    └───┬────┘    └────┬─────┘  └────────┘
                   │           │             │              │
                 Mongo       Mongo         Mongo          Mongo
                   │           │             │              │
                   └───────────┴──────┬──────┴──────────────┘
                                      ▼
                          ┌───────────────────────┐
                          │   NATS JetStream       │  (durable pull consumers,
                          │   (event backbone)     │   one per service+subject)
                          └───────────┬───────────┘
                                      ▼
                              ┌───────────────┐
                              │  expiration   │── Bull/Redis delayed jobs
                              └───────────────┘
```

Cross-service identifiers (`userId`, `ticketId`, `orderId`) are stored as plain strings, not database references — each service keeps a local, event-synced replica of just the fields it needs (e.g. orders keeps a minimal copy of each ticket). Replica updates are version-ordered, and action consumers are idempotent, so the system stays correct under at-least-once delivery and out-of-order events.

---

## Services

| Service | Responsibility | Data store |
| --- | --- | --- |
| **auth** | Signup / signin, JWT issuance, current-user resolution | MongoDB |
| **tickets** | Ticket listings (CRUD), image uploads, reservation locking | MongoDB |
| **orders** | Order lifecycle, reserves/releases tickets, expiry windows, receipts | MongoDB |
| **payments** | Stripe PaymentIntents, webhook ingestion, refunds, payment records | MongoDB |
| **expiration** | Schedules and fires order-expiration jobs (no HTTP API) | Redis (Bull) |
| **client** | Next.js / React front end | — |
| **common** | Shared library: event base classes, errors, middleware, logger, metrics, tracing | published to npm as `@zeina-tickethub/common` |

---

## Event-Driven Flow

Services choreograph the order lifecycle through events on JetStream. Subjects:

| Subject | Published by | Consumed by |
| --- | --- | --- |
| `ticket:created` / `ticket:updated` | tickets | orders |
| `order:created` | orders | tickets (lock), expiration (schedule), payments |
| `order:cancelled` | orders | tickets (release), payments (refund) |
| `expiration:complete` | expiration | orders (cancel) |
| `payment:initiated` | payments | orders (→ AwaitingPayment) |
| `payment:created` | payments | orders (→ Complete) |
| `payment:refunded` | payments | orders |

**Example — buy → reserve → pay:** `orders` publishes `order:created` → `tickets` locks the ticket, `expiration` schedules a job, and `payments` is ready to charge. On checkout, `payments` publishes `payment:initiated` (order → AwaitingPayment); when Stripe's webhook confirms the charge, `payments` publishes `payment:created` and `orders` marks the order Complete. If the window lapses first, `expiration` publishes `expiration:complete`, `orders` cancels, and `tickets` releases the lock.

---

## Production Engineering

What separates this from a tutorial demo — see [docs/production-enhancements.md](docs/production-enhancements.md) for the full record.

### Reliability & Infrastructure
- Shared `/healthz` (liveness) and `/readyz` (readiness — checks Mongo + NATS) on every service, wired to Kubernetes probes
- Graceful shutdown: SIGTERM drains the HTTP server, NATS, and Mongo before exit, with a `preStop` hook so the pod leaves the load balancer first
- Persistent volumes for NATS and Redis (fixes a real bug where a pod restart silently dropped scheduled expirations)
- Resource requests/limits, 2 replicas for stateless services, and CPU-based Horizontal Pod Autoscalers

### Event-Driven Robustness
- **Idempotent consumers** — a `processedEvents` record guarantees exactly-once *side effects* under at-least-once delivery
- **Graceful failure handling** — version conflicts / out-of-order events are logged and redelivered (nak), not crashed
- **Dead-letter handling** — poison messages are archived and terminated after a delivery cap instead of looping forever
- **NATS Streaming → JetStream** — migrated off the EOL broker to durable pull consumers with native persistence

### Payments
- PaymentIntents + Stripe.js confirmation, idempotency keys, webhook-as-source-of-truth, refunds on cancellation, and persisted receipts (closes the "money taken, no ticket" and "crash between charge and DB write" gaps)

### Observability
See the dedicated section below.

---

## Observability

A full four-pillar observability stack, shared across services via `common` and deployed under `infra/k8s/`.

| Pillar | Implementation | What you get |
| --- | --- | --- |
| **Logs** | `pino` + `pino-http` | Structured JSON to stdout with `service`, request id (propagated via `x-request-id`), and event subjects; health-probe noise demoted to debug |
| **Metrics** | `prom-client` → Prometheus + Grafana | Per-service `/metrics` (HTTP rate/latency, event throughput/retries/dead-letters, `orders_created`, `payments_succeeded`/`failed`) + a provisioned **TicketHub Overview** dashboard; NATS metrics via `prometheus-nats-exporter` |
| **Traces** | OpenTelemetry → Jaeger | Auto-instrumented Express/Mongo/HTTP, with **W3C trace context propagated across NATS** by hand in the publisher/listener — one checkout renders as a single end-to-end trace spanning orders → tickets → payments → expiration |
| **Alerts** | Prometheus rules + AlertManager | Payment-failure-rate, listener-redelivery-spike, dead-letter, service-down, and HTTP-5xx alerts, plus a Watchdog dead-man's switch |

Prometheus auto-discovers pods via `prometheus.io/scrape` annotations. Trace context crosses the message bus because `common`'s base publisher injects the active context into JetStream message headers and the base listener extracts it to re-root the consumer span.

**View the dashboards** (with the cluster running):

```bash
kubectl port-forward svc/grafana-srv      3000:3000   # Grafana  → http://localhost:3000  (anonymous view)
kubectl port-forward svc/jaeger-srv       16686:16686 # Jaeger   → http://localhost:16686
kubectl port-forward svc/prometheus-srv   9090:9090   # Prometheus
kubectl port-forward svc/alertmanager-srv 9093:9093   # AlertManager
```

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript (Node.js 20) |
| Services | Express 4, Mongoose 8 |
| Front end | Next.js 15, React 19, axios |
| Messaging | NATS JetStream (`nats` SDK) |
| Delayed jobs | Bull + Redis (expiration) |
| Payments | Stripe (PaymentIntents + webhooks) |
| Auth | JWT over `cookie-session` |
| Image storage | Cloudinary (signed uploads) |
| Database | MongoDB — database-per-service (Atlas at runtime, `mongodb-memory-server` in tests) |
| Shared library | `@zeina-tickethub/common` (published to npm) |
| Orchestration | Kubernetes, Skaffold, ingress-nginx |
| Scaling & health | HPA (`autoscaling/v2`), liveness/readiness probes, PVCs |
| Logging | pino, pino-http |
| Metrics | prom-client, Prometheus, Grafana, prometheus-nats-exporter |
| Tracing | OpenTelemetry SDK, Jaeger |
| Alerting | Prometheus alerting rules, AlertManager |
| Testing | Jest, ts-jest, SuperTest, mongodb-memory-server |
| Dev tooling | ts-node-dev |

---

## Project Structure

```
tickethub/
├── auth/                       # Auth service (signup/signin, JWT)
├── tickets/                    # Ticket listings + image upload
├── orders/                     # Order lifecycle + reservations
├── payments/                   # Stripe PaymentIntents, webhook, refunds
├── expiration/                 # Bull/Redis delayed expiration jobs (no HTTP API)
├── client/                     # Next.js / React front end
├── common/                     # Shared lib: events, errors, middleware, logger, metrics, tracing
│   └── src/
│       ├── events/             # base-listener, base-publisher, subjects, trace, dead-letter, idempotent
│       ├── middlewares/        # current-user, require-auth, error-handler, health-router, validate-request
│       ├── logger.ts           # pino logger + pino-http request logger
│       └── metrics.ts          # prom-client registry, /metrics router, counters
├── infra/
│   └── k8s/
│       ├── *-depl.yaml         # Deployments + Services (auth, tickets, orders, payments, expiration, client)
│       ├── nats-depl.yaml      # NATS JetStream
│       ├── expiration-redis-depl.yaml
│       ├── ingress-srv.yaml    # Path-based routing for tickethub.com
│       ├── hpa.yaml            # Horizontal Pod Autoscalers
│       └── monitoring-*.yaml   # Prometheus, Grafana, Jaeger, AlertManager, nats-exporter
├── seed/                       # Seed script (creates demo users + tickets via the API)
├── docs/
│   └── production-enhancements.md   # Engineering record (Phases A–D)
└── skaffold.yaml               # Build + deploy orchestration
```

---

## Running Locally

The project runs on a local Kubernetes cluster via Skaffold.

### Prerequisites
- Docker Desktop with **Kubernetes enabled**
- [`skaffold`](https://skaffold.dev/) and `kubectl`
- An [ingress-nginx](https://kubernetes.github.io/ingress-nginx/) controller installed in the cluster
- A host entry mapping the ingress: add `127.0.0.1 tickethub.com` to `/etc/hosts`

### 1. Create the required secrets
Secrets are kept out of the repo and created directly in the cluster. Create each with your own values:

| Secret | Keys |
| --- | --- |
| `jwt-secret` | `JWT_KEY` |
| `mongo-secret` | `AUTH_MONGO_URI`, `TICKETS_MONGO_URI`, `ORDERS_MONGO_URI`, `PAYMENTS_MONGO_URI` |
| `stripe-secret` | `STRIPE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `cloudinary-secret` | Cloudinary cloud name / API key / secret |
| `grafana-admin` | `admin-password` |

```bash
kubectl create secret generic jwt-secret    --from-literal=JWT_KEY=<random-string>
kubectl create secret generic grafana-admin --from-literal=admin-password=<password>
# ...and similarly for mongo-secret, stripe-secret, cloudinary-secret
```

### 2. Start the cluster
```bash
skaffold dev      # builds all images, deploys to the cluster, and live-reloads on change
```

Then open **https://tickethub.com** (self-signed cert in dev).

### 3. Seed demo data (optional)
```bash
cd seed && npm install && npm run seed
```

### 4. Stripe webhooks in local dev
Payment completion is driven by Stripe's webhook. In local dev, forward events to the cluster:
```bash
stripe listen --forward-to https://tickethub.com/api/payments/webhook
```

---

## Testing

Each service has its own Jest suite. External dependencies are mocked and MongoDB runs in-memory (`mongodb-memory-server`), so the suites need no live infrastructure.

| Service | Tests | Focus |
| --- | --- | --- |
| auth | 12 | Signup/signin/signout, current-user, validation |
| tickets | 52 | Ticket CRUD, ownership, reservation rules, event listeners |
| orders | 37 | Order lifecycle, reservation guards, base-listener (retry/dead-letter), event listeners |
| payments | 15 | PaymentIntent route, webhook (signature, idempotency), refund listener |
| **Total** | **116** | |

```bash
cd <service> && npm run test:ci      # run a service's suite once
```

Beyond unit tests, changes are verified with a full end-to-end app-flow run against the live cluster through the ingress (reserve → block duplicates → pay-intent → AwaitingPayment → cancel/refund), with logs, metrics, and traces confirmed in the observability stack.
