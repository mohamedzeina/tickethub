# TicketHub

A StubHub-style ticket marketplace built as a set of **Node.js microservices** on **Kubernetes**, communicating asynchronously over **NATS JetStream**. Sellers list event tickets (one seat or twenty), buyers reserve seats — which holds them for a 15-minute payment window — and pay with Stripe; unpaid holds expire and return the seats to the pool. Around that core sit verified accounts, buyer-initiated refunds, Stripe Connect seller payouts, per-seat QR admission passes with a gate scanner, seller reviews, wishlists with price-drop alerts, and in-app plus email notifications. The system is hardened to production shape: health probes and graceful shutdown, idempotent and dead-lettered event consumers, an atomic oversell guard, Redis-backed rate limiting, and a full observability stack — **structured logging, Prometheus metrics, Grafana dashboards, OpenTelemetry tracing through Jaeger, and AlertManager**.

> This started as a Stephen Grider–style microservices demo and was deliberately matured into a production-shaped system. The full engineering record — decisions, trade-offs, and verification — lives in [docs/production-enhancements.md](docs/production-enhancements.md), and the feature roadmap in [docs/backlog.md](docs/backlog.md).

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
- [Deploying](#deploying)
- [Testing](#testing)

---

## Features

### Marketplace
- List a ticket for sale with title, price per seat, **quantity (1–20)**, event date, venue, description, category, and an uploaded image
- Edit, unlist, or relist your own tickets (edits freeze once any seat is reserved; an unlisted ticket can no longer be reserved)
- Browse with **filters, sort, and pagination**; **debounced typeahead search** in the navbar with a dedicated results page
- Ticket detail pages with seller display name and aggregate rating
- Image uploads via Cloudinary with a **signed direct-to-browser upload** flow — the API secret never leaves the server

### Buying & Reservations
- Reserve **one or more seats** on a listing; the seats are held while the order is active
- Overselling is prevented by an **atomic compare-and-swap** on the seat count, so concurrent buyers cannot both claim the last seat
- A hold expires after a configurable window (default 15 min), releasing the seats automatically; a warning event fires shortly before
- "Can't buy your own ticket", "already reserved", and "only N seats left" rules enforced server-side
- Order lifecycle: `Created → AwaitingPayment → Complete`, plus `Cancelled` and `Refunded`

### Payments
- Stripe **PaymentIntents** with the client confirming the card via Stripe Elements
- **Webhook as source of truth** — a payment is only recorded once Stripe confirms `payment_intent.succeeded`
- **Idempotency keys** plus unique-index guards prevent double-charges on retry, refresh, or redelivered webhooks
- Persisted receipts (Stripe reference, seats × price, amount, paid-at) on the order detail and history pages

### Refunds
- Buyer-initiated refunds from the order page, with the deadline shown up front
- Policy window: refundable until the **sooner** of `paidAt + 24h` and `eventDate − 48h`, and blocked entirely once a pass has been scanned
- **Webhook-confirmed** — the order flips to `Refunded` only on Stripe's `charge.refunded`, which also relists the seats, revokes unused passes, soft-hides the seller review, and emails the buyer

### Seller Payouts
- Stripe **Connect Express** hosted onboarding, with a contextual nudge on the listing pages
- Separate charge plus delayed transfer: a sweep releases each sale once it clears the refund window
- Platform fee in basis points (default 10%), computed in integer cents so the seller is never overpaid
- Earnings view showing the full **Clearing → Held → Paid** lifecycle; payouts for sellers who haven't connected yet are held and released automatically once they do

### Admission
- One **signed, single-use QR pass per seat**, minted when payment settles
- Passes are HMAC-signed and verified in constant time; redemption is a single atomic update, so two simultaneous scans can never both admit
- Operator console at `/gate` with live camera scanning and a paste-the-code fallback
- Scanning stamps the order (blocking later refunds) and notifies the buyer

### Reviews & Wishlists
- One review per completed order, with seller profile pages and aggregate ratings shown on every listing card
- Reviews on refunded orders are soft-hidden and frozen
- Save any listing to a wishlist; get **price-drop** and **back-available** alerts in-app and by email

### Accounts
- Signup / signin with JWT issued in a cookie session, shared across services via a `currentUser` middleware
- **Email verification** gating listing, ordering, and paying (browsing stays open), with a persistent resend banner
- **Password reset** with hashed, TTL'd tokens and no email enumeration
- Optional public **display name**; sellers are named, buyers stay opaque handles by design
- **Rate limiting** on auth endpoints, keyed per-IP *and* per-email, Redis-backed so counters are shared across replicas

### Notifications
- In-app feed with an unread badge, dropdown, and toast stack — 13 notification types across buyer and seller
- Transactional email for verification, password reset, receipts, expiring/expired holds, refunds, price drops, and availability

---

## Architecture

TicketHub is composed of **nine backend services**, a Next.js client, and a shared library, each service owning its own MongoDB database. Services never call each other synchronously — they communicate by publishing and consuming events on **NATS JetStream**, so each service can fail, restart, and scale independently. An nginx ingress routes external traffic by path.

```
                                 tickethub.com
                                       │
                            ┌──────────▼───────────┐
                            │    ingress-nginx     │   path-based routing
                            └──────────┬───────────┘
        ┌──────────┬──────────┬────────┼─────────┬──────────┬──────────┐
        ▼          ▼          ▼        ▼         ▼          ▼          ▼
    ┌───────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐ ┌────────┐ ┌────────┐
    │ auth  │ │tickets │ │ orders │ │payments│ │reviews│ │wishlist│ │ client │
    └───┬───┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬───┘ └───┬────┘ └────────┘
        │         │          │          │          │         │
        │    ┌────────────┐  │     ┌───────────┐   │         │
        │    │notifications│ │     │ admission │   │         │
        │    └──────┬─────┘  │     └─────┬─────┘   │         │
        └───────────┴────────┴───────────┴─────────┴─────────┘
                                   ▼
                       ┌───────────────────────┐
                       │    NATS JetStream     │  18 subjects, durable pull
                       │   (event backbone)    │  consumers per service
                       └───────────┬───────────┘
                                   ▼
                           ┌───────────────┐
                           │  expiration   │──── Bull / Redis delayed jobs
                           └───────────────┘

  Ingress paths:  /api/users → auth      /api/tickets → tickets
                  /api/orders → orders   /api/payments → payments
                  /api/notifications     /api/reviews
                  /api/passes → admission  /api/wishlists
                  /  → client

  Supporting infra: MongoDB Atlas (database per service), 2× Redis (Bull
  delayed jobs + rate-limit counters), Mailpit (dev SMTP sink), and the
  Prometheus / Grafana / Jaeger / AlertManager stack.
```

Cross-service identifiers (`userId`, `ticketId`, `orderId`) are stored as plain strings, not database references — each service keeps a local, event-synced replica of just the fields it needs (orders, admission, reviews, and wishlists each hold a ticket replica; notifications holds an order replica). Replica updates are version-ordered, and action consumers are idempotent, so the system stays correct under at-least-once delivery and out-of-order events.

---

## Services

| Service | Responsibility | Data store |
| --- | --- | --- |
| **auth** | Signup / signin, JWT issuance, email verification, password reset, display names, rate limiting | MongoDB |
| **tickets** | Ticket listings (CRUD), image uploads, quantity pool, reservation locking | MongoDB |
| **orders** | Order lifecycle, seat reservation, expiry windows, refund policy, receipts, payout sweep | MongoDB |
| **payments** | Stripe PaymentIntents, webhook ingestion, refunds, Connect onboarding + seller transfers | MongoDB |
| **expiration** | Schedules and fires hold-expiry and warning jobs (no HTTP API, no Mongo) | Redis (Bull) |
| **notifications** | In-app notification feed and all transactional email (12 event listeners, 0 publishers) | MongoDB |
| **reviews** | Per-order seller reviews, seller and per-card aggregate ratings | MongoDB |
| **admission** | Signed single-use admission passes, QR gate redemption, operator API | MongoDB |
| **wishlists** | Saved listings, price-drop and back-available alerts | MongoDB |
| **client** | Next.js / React front end (SSR) | — |
| **common** | Shared library: event base classes, errors, middleware, logger, metrics, tracing, mailer + email templates | published to npm as `@zeina-tickethub/common` |

---

## Event-Driven Flow

Services choreograph every lifecycle through events on JetStream. All **18 subjects**:

| Subject | Published by | Consumed by |
| --- | --- | --- |
| `ticket:created` | tickets | orders, admission, reviews, wishlists |
| `ticket:updated` | tickets | orders, admission, reviews, wishlists |
| `ticket:redeemed` | admission | orders, notifications |
| `order:created` | orders | tickets (lock), expiration (schedule), payments, admission, reviews, notifications |
| `order:cancelled` | orders | tickets (release), payments, expiration (drop jobs), reviews |
| `order:refund:requested` | orders | payments |
| `order:payout:due` | orders | payments |
| `payout:processed` | payments | notifications |
| `expiration:complete` | expiration | orders (cancel), notifications |
| `expiration:warning` | expiration | notifications |
| `payment:initiated` | payments | orders (→ AwaitingPayment) |
| `payment:created` | payments | orders (→ Complete), admission (mint passes), reviews, notifications |
| `payment:refunded` | payments | orders (→ Refunded), admission (revoke), notifications |
| `user:verification:requested` | auth | notifications |
| `password:reset:requested` | auth | notifications |
| `wishlist:price-dropped` | wishlists | notifications |
| `wishlist:available` | wishlists | notifications |
| `review:created` | reviews | notifications |

**Example — buy → reserve → pay → admit:** `orders` publishes `order:created` → `tickets` locks the seats, `expiration` schedules the expiry and warning jobs, `payments` prepares to charge, and `notifications` tells the buyer. On checkout, `payments` publishes `payment:initiated` (order → AwaitingPayment); when Stripe's webhook confirms the charge, `payments` publishes `payment:created`, `orders` marks the order Complete, and `admission` mints one signed pass per seat. At the venue, a scan publishes `ticket:redeemed`, stamping the order so it can no longer be refunded. If the window lapses first, `expiration` publishes `expiration:complete`, `orders` cancels, and `tickets` returns the seats to the pool.

---

## Production Engineering

What separates this from a tutorial demo — see [docs/production-enhancements.md](docs/production-enhancements.md) for the full record.

### Reliability & Infrastructure
- Shared `/healthz` (liveness) and `/readyz` (readiness — checks Mongo + NATS) on every service, wired to Kubernetes probes
- Graceful shutdown: SIGTERM drains the HTTP server, NATS, and Mongo before exit, with a `preStop` hook so the pod leaves the load balancer first
- Persistent volumes for NATS and Redis (fixes a real bug where a pod restart silently dropped scheduled expirations)
- Resource requests and limits on every deployment. CPU-based Horizontal Pod Autoscalers are authored in `infra/hpa/` but **opt-in** (`skaffold dev -p autoscale`) — on a single-node cluster they amplify the cold-start storm. `expiration` is deliberately excluded and pinned to one replica, since a second would double-publish delayed jobs.

### Concurrency & Correctness
- **Atomic compare-and-swap seat reservation** — a single `findOneAndUpdate` combining an `$expr` capacity check with `$inc`, so two concurrent buyers cannot both take the last seat; release is symmetrically guarded so a double-release can't go negative
- **Optimistic concurrency control** (`mongoose-update-if-current`) on every replicated aggregate, with out-of-order events nak'd for retry rather than misapplied
- Unique indexes used as concurrency primitives — `(channel, sequence)` on processed events, `(orderId, seat)` on passes, unique `orderId` on payouts and refunds — each paired with an explicit duplicate-key catch
- Version conflicts surface as a clean `400` ("this ticket was just reserved"), never a 500

### Event-Driven Robustness
- **Effectively-once consumers** — dedupe on `(subject, stream sequence)` with a documented check → apply → mark ordering, so a crash between apply and mark replays only safe effects
- **Graceful failure handling** — version conflicts and out-of-order events are logged at `warn` and redelivered (nak); unparseable payloads dead-letter immediately instead of burning the retry budget
- **Dead-letter handling** — poison messages are archived and `term()`d after a delivery cap, with `max_deliver` deliberately set two above the logical cap so a *failed dead-letter write* can still retry. Two backing stores: Mongo for data services, a Redis list for the Mongo-less expiration service.
- **NATS Streaming → JetStream** — migrated off the EOL broker to durable pull consumers with native persistence

### Payments
- PaymentIntents + Stripe Elements confirmation, idempotency keys, webhook-as-source-of-truth, and persisted receipts (closes the "money taken, no ticket" and "crash between charge and DB write" gaps)
- Refunds are webhook-confirmed: a pending row is written on request, and only `charge.refunded` flips the order — via a single conditional upsert, so only one delivery of a redelivered webhook wins
- Connect payouts use separate charge plus transfer with `source_transaction`, so a transfer draws from the originating charge instead of failing on an unavailable platform balance; the transfer idempotency key is currency-scoped

### Security
- Passwords hashed with scrypt and per-user salts; verification and reset tokens stored **hashed** with TTLs, so a database leak can't be used to take over accounts
- Admission passes are HMAC-signed and verified with a constant-time compare; the gate operator key is compared the same way
- Auth rate limiting is Redis-backed and **fails open** by design, keyed both per-IP (flood backstop) and per-email/user (targeted attempts)

> Known gaps, tracked rather than hidden: JWTs carry no expiry, there is no CSRF protection or `helmet`, and gate operator auth is a shared API key rather than a real operator role.

---

## Observability

A full four-pillar observability stack, shared across services via `common` and deployed under `infra/k8s/`.

| Pillar | Implementation | What you get |
| --- | --- | --- |
| **Logs** | `pino` + `pino-http` | Structured JSON to stdout with `service`, request id (propagated via `x-request-id`), and event subjects; health-probe noise demoted to debug |
| **Metrics** | `prom-client` → Prometheus + Grafana | Per-service `/metrics` (HTTP rate/latency labelled by *route template* to control cardinality, event throughput/retries/dead-letters, rate-limit rejections, `orders_created`, `payments_succeeded`/`failed`) + a provisioned nine-panel **TicketHub Overview** dashboard; NATS metrics via `prometheus-nats-exporter` |
| **Traces** | OpenTelemetry → Jaeger | Auto-instrumented Express/Mongo/HTTP, with **W3C trace context propagated across NATS by hand** in the publisher/listener — one checkout renders as a single end-to-end trace spanning orders → tickets → payments → admission |
| **Alerts** | Prometheus rules + AlertManager | Payment-failure-rate, listener-redelivery-spike, dead-letter, service-down, and HTTP-5xx alerts, plus a Watchdog dead-man's switch |

Prometheus auto-discovers pods via `prometheus.io/scrape` annotations. Trace context crosses the message bus because `common`'s base publisher injects the active context into JetStream message headers and the base listener extracts it to re-root the consumer span — auto-instrumentation does not cover the NATS client, so this is done explicitly.

**View the dashboards** (with the cluster running):

```bash
npm run monitor      # port-forwards all four, with retry-on-pod-restart
```

| Dashboard | URL | Override |
| --- | --- | --- |
| Grafana | http://localhost:3000 (anonymous view) | `GRAFANA_PORT` |
| Prometheus | http://localhost:9090 | `PROMETHEUS_PORT` |
| Jaeger | http://localhost:16686 | `JAEGER_PORT` |
| AlertManager | http://localhost:9093 | `ALERTMANAGER_PORT` |

None of these are exposed through the ingress by design — port-forward only. The raw equivalents (`kubectl port-forward svc/grafana-srv 3000:3000`, etc.) still work as a manual fallback.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript (Node.js 20) |
| Services | Express 4, Mongoose 8 |
| Front end | Next.js 15 (Pages Router, SSR), React 19, axios; hand-built CSS design system on a Tailwind reset |
| Messaging | NATS JetStream (`nats` SDK) |
| Delayed jobs | Bull + Redis (expiration) |
| Payments | Stripe — PaymentIntents, webhooks, refunds, Connect Express payouts |
| Auth | JWT over `cookie-session` |
| Rate limiting | `rate-limiter-flexible` backed by a dedicated Redis |
| Email | nodemailer; Mailpit as the local SMTP sink, templates in `common` |
| Image storage | Cloudinary (signed direct-to-browser uploads) |
| Database | MongoDB — database-per-service (Atlas at runtime, `mongodb-memory-server` in tests) |
| Shared library | `@zeina-tickethub/common` (published to npm) |
| Orchestration | Kubernetes, Skaffold, ingress-nginx |
| Scaling & health | HPA (`autoscaling/v2`, opt-in), liveness/readiness probes, PVCs |
| Logging | pino, pino-http |
| Metrics | prom-client, Prometheus, Grafana, prometheus-nats-exporter |
| Tracing | OpenTelemetry SDK, Jaeger |
| Alerting | Prometheus alerting rules, AlertManager |
| Testing | Jest, ts-jest, SuperTest, mongodb-memory-server, plus a custom live-cluster e2e harness (plain Node) |
| Dev tooling | ts-node-dev, Stripe CLI |

---

## Project Structure

```
tickethub/
├── auth/                       # Signup/signin, JWT, verification, reset, display names
├── tickets/                    # Ticket listings, quantity pool, image upload
├── orders/                     # Order lifecycle, seat reservation, refunds, payout sweep
├── payments/                   # Stripe PaymentIntents, webhook, refunds, Connect payouts
├── expiration/                 # Bull/Redis delayed expiry + warning jobs (no HTTP API)
├── notifications/              # In-app feed + all transactional email
├── reviews/                    # Seller reviews and aggregate ratings
├── admission/                  # Signed QR admission passes + gate redemption
├── wishlists/                  # Saved listings + price-drop / availability alerts
├── client/                     # Next.js / React front end
├── common/                     # Shared lib, published to npm
│   └── src/
│       ├── events/             # base-listener, base-publisher, subjects, stream,
│       │                       #   trace, dead-letter, idempotent, per-domain types
│       ├── middlewares/        # current-user, require-auth, require-verified,
│       │                       #   rate-limiter, error-handler, health-router, validate-request
│       ├── emails/             # 9 HTML email templates (receipt, verify, reset, refund, …)
│       ├── mailer.ts           # nodemailer transport
│       ├── logger.ts           # pino logger + pino-http request logger
│       └── metrics.ts          # prom-client registry, /metrics router, counters
├── infra/
│   ├── k8s/
│   │   ├── *-depl.yaml         # Deployments + Services (all 9 services + client)
│   │   ├── nats-depl.yaml      # NATS JetStream (PVC-backed)
│   │   ├── expiration-redis-depl.yaml   # Bull job store (PVC-backed)
│   │   ├── ratelimit-redis-depl.yaml    # Rate-limit counters (ephemeral)
│   │   ├── mailpit-depl.yaml   # Dev SMTP sink (SMTP 1025, UI 8025)
│   │   ├── ingress-srv.yaml    # Path-based routing for tickethub.com
│   │   └── monitoring-*.yaml   # Prometheus, Grafana, Jaeger, AlertManager, nats-exporter
│   └── hpa/
│       └── hpa.yaml            # Horizontal Pod Autoscalers (opt-in profile)
├── scripts/
│   ├── dev.sh                  # One-command dev stack + preflight
│   └── monitor.sh              # Port-forward the four dashboards
├── e2e/                        # 17 live-cluster suites + harness + runner
├── seed/                       # Seed script (creates demo users + tickets via the API)
├── docs/
│   ├── production-enhancements.md   # Engineering record (Phases A–D)
│   ├── backlog.md                   # Feature roadmap
│   └── 11-seller-payouts.md         # Payouts design doc
└── skaffold.yaml               # Build + deploy orchestration (dev + prod profiles)
```

---

## Running Locally

The project runs on a local Kubernetes cluster via Skaffold.

### Prerequisites
- Docker Desktop with **Kubernetes enabled**
- [`skaffold`](https://skaffold.dev/) and `kubectl`
- The [Stripe CLI](https://stripe.com/docs/stripe-cli), logged in (`stripe login`) — payment completion is webhook-driven
- Node.js 20 (for the seed script and e2e harness)
- An [ingress-nginx](https://kubernetes.github.io/ingress-nginx/) controller installed in the cluster
- A host entry mapping the ingress: add `127.0.0.1 tickethub.com` to `/etc/hosts`
- `metrics-server` — only if you opt into the `autoscale` profile

### 1. Create the required secrets
Secrets are kept out of the repo and created directly in the cluster. **Every key below is required** — a missing one leaves its pod in `CreateContainerConfigError` with no hint as to which.

| Secret | Keys |
| --- | --- |
| `jwt-secret` | `JWT_KEY` |
| `mongo-secret` | `AUTH_MONGO_URI`, `TICKETS_MONGO_URI`, `ORDERS_MONGO_URI`, `PAYMENTS_MONGO_URI`, `NOTIFICATIONS_MONGO_URI`, `REVIEWS_MONGO_URI`, `ADMISSION_MONGO_URI`, `WISHLISTS_MONGO_URI` |
| `stripe-secret` | `STRIPE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` |
| `cloudinary-secret` | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| `admission-secret` | `PASS_SIGNING_SECRET`, `GATE_API_KEY` |
| `grafana-admin` | `admin-password` |

```bash
kubectl create secret generic jwt-secret    --from-literal=JWT_KEY=<random-string>
kubectl create secret generic grafana-admin --from-literal=admin-password=<password>
# ...and similarly for mongo-secret, stripe-secret, cloudinary-secret, admission-secret
```

Verify without starting anything:

```bash
bash scripts/dev.sh --check
```

### 2. Start the stack
```bash
npm run dev
```

This preflights (hosts entry, cluster reachable, ingress-nginx installed, all six secrets **and their keys**), then starts three things in one terminal with prefixed, colour-coded output:

- `skaffold dev` — builds all images, deploys, and live-reloads on change
- `kubectl port-forward svc/mailpit-srv 8025:8025` — with a reconnect loop
- `stripe listen --skip-verify --forward-to https://tickethub.com/api/payments/webhook`

Ctrl+C stops all three. Env knobs: `WEBHOOK_URL`, `MAILPIT_PORT`, and `SKIP_PREFLIGHT=1` to start despite a failed preflight.

Then open **https://tickethub.com** (self-signed cert in dev). All outbound email lands in **Mailpit at http://localhost:8025** — nothing is sent externally in dev.

> `--skip-verify` on `stripe listen` is required because the dev ingress serves a self-signed cert, which the CLI would otherwise reject (TLS x509), so webhooks would never reach payments.

### 3. Seed demo data (optional)
```bash
npm run seed      # drops every service DB, then creates demo users + tickets via the API
```

### 4. Dashboards (optional)
```bash
npm run monitor
```

### Stopping
Ctrl+C in the `npm run dev` terminal. `skaffold dev` removes what it deployed on exit; `npm run down` (`skaffold delete`) tears down anything left behind.

---

## Deploying

`skaffold.yaml` has a **`prod` profile** that builds the multi-stage production Dockerfiles (compiled `dist/`, production dependencies only, non-root user) instead of the `ts-node-dev` dev images.

```bash
export NEXT_PUBLIC_STRIPE_KEY=pk_test_...   # see the footgun below
npm run build:prod                          # skaffold build -p prod
npm run deploy:prod                         # skaffold run  -p prod
skaffold run -p prod,autoscale              # ...including the HPAs
```

The profile differs from dev in four ways:

- **Production Dockerfiles** for all 10 artifacts, and no file sync
- **`gitCommit` tag policy** instead of `:latest`, so a redeploy actually rolls the pods
- **`platforms: ['linux/arm64']`**, targeting an Ampere/Graviton-class node — **change this to `linux/amd64` for an Intel/AMD cluster**
- Images are pushed to Docker Hub under `toxiczeina/*`

> **Footgun:** `NEXT_PUBLIC_STRIPE_KEY` must be exported in your shell before a prod build. Next inlines `NEXT_PUBLIC_*` at build time, so the runtime env var in `client-depl.yaml` reaches the browser bundle only with `next dev` — a production build without it silently ships `undefined` and checkout breaks.

A successful `npm run build:prod` is the real gate before deploying: unlike the dev images, it runs a full `tsc` typecheck and a clean `npm ci`, so it catches type errors and lockfile drift that `ts-node-dev` skips.

In production, `MAIL_HOST`/`MAIL_PORT` should point at a real SMTP relay rather than Mailpit, and webhooks should come from a Stripe Dashboard endpoint rather than `stripe listen`.

---

## Testing

Each service has its own Jest suite. External dependencies are mocked — every service ships a `__mocks__/nats-wrapper.ts` JetStream double — and MongoDB runs in-memory (`mongodb-memory-server`), so the suites need no live infrastructure.

| Service | Tests | Focus |
| --- | --- | --- |
| auth | 44 | Signup/signin/signout, current-user, verification, password reset, display names, rate limiters |
| tickets | 57 | Ticket CRUD, ownership, quantity pool, reservation rules, event listeners |
| orders | 58 | Order lifecycle, seat CAS, reservation guards, refund policy, base-listener (retry/dead-letter), listeners |
| payments | 17 | PaymentIntent route, webhook (signature, idempotency), refunds, Connect + payouts |
| notifications | 38 | Feed routes, read-state, 12 event listeners, email dispatch |
| reviews | 27 | Review creation gating, aggregates, batch ratings, replication listeners |
| admission | 20 | Pass minting, signed-code verification, single-use redemption, revocation |
| wishlists | 22 | Save/remove, alert triggers, version-guarded replication |
| expiration | 3 | Delayed-job scheduling |
| **Total** | **286** across 69 files | |

```bash
cd <service> && npm run test:ci      # run a service's suite once
```

> `expiration` has no `test:ci` script — use `npx jest` there.

CI runs these on pull requests via four path-filtered GitHub Actions workflows (`auth`, `tickets`, `orders`, `payments`). The other five services have suites but **are not yet wired into CI**.

### End-to-end

Beyond unit tests, a custom harness drives **17 suites / 421 assertions** against the live cluster through the ingress — real HTTP, real events, real Stripe test settlements, and real emails read back out of Mailpit.

```bash
npm run e2e            # node e2e/run-all.js — all 17 suites
node e2e/refunds.js    # or a single suite
```

Suites: `auth-core`, `account-hardening`, `abuse`, `auth-gating`, `tickets`, `orders`, `payments`, `notifications`, `refunds`, `payouts`, `admission`, `multi-seat`, `reviews`, `per-card-ratings`, `display-names`, `wishlists`, `flows`.

Prerequisites: the stack running with all pods Ready, Mailpit reachable at `http://localhost:8025`, and `stripe listen` active for the suites that settle real payments (`refunds`, `payouts`, `admission`, `multi-seat`, `per-card-ratings`). Environment: `BASE_URL` (default `https://tickethub.com`), `MAILPIT_URL`, `HOST_HEADER`.
