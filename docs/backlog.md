# TicketHub — Feature Backlog

A prioritized list of features and improvements, grounded in how the system
currently works. Use this as a living roadmap; check items off or move them
between tiers as priorities shift.

> The platform-maturity work (reliability, event-driven robustness, payments,
> observability) shipped as Phases A–D — see
> [production-enhancements.md](production-enhancements.md). Items below that this
> closed are marked ✅.

---

## How the system works today (baseline)

TicketHub is an event-driven microservices app (StubHub-style ticket resale).

**Services** (each owns its own MongoDB; communicate over NATS JetStream):

| Service | Responsibility | Routes / jobs |
|---------|----------------|---------------|
| **auth** | Accounts & sessions | signup, signin, signout, currentuser (JWT in a cookie) |
| **tickets** | Ticket listings | create, update, show, list |
| **orders** | Reservations | create (reserves ticket + sets `expiresAt`), cancel, show, list |
| **payments** | Charging | create-intent (Stripe PaymentIntent), webhook (source of truth), refund on cancel |
| **expiration** | Reservation timeout | Bull/Redis delayed job → publishes `expiration:complete` |
| **client** | Next.js (pages router) UI | Tailwind, server-rendered via ingress |
| **common** | Shared lib (`@zeina-tickethub/common`) | errors, middlewares, event base classes + subjects |

**Event flow:** `ticket:created/updated` → orders & payments keep local ticket
replicas. `order:created` → expiration schedules a timeout, payments records the
order. `expiration:complete` → orders cancels unpaid orders. `payment:created` →
orders marks the order complete. Concurrency is guarded with
`mongoose-update-if-current` (optimistic versioning).

**Infra:** k8s manifests in `infra/k8s`, single nginx ingress, mongo-per-service,
NATS + Redis. CI runs per-service test workflows (GitHub Actions).

### Notable gaps (what the baseline does *not* have)

Several original gaps are now closed (✅): tickets carry full event details +
images; listings have server-side search/filter/sort/pagination; sellers can
edit/unlist; there's a seed-data script; self-purchase is blocked and the hold
window is 15 min. **Phases A–D** then added refunds + receipts/order history,
PaymentIntents + webhooks, and a full observability stack (logs, metrics,
tracing, alerting) with health checks. Remaining gaps:

- Tickets are still **single-unit** — no quantity / multi-seat listings.
- No user **profile**, no **roles** (✅ password reset + email verification done).
- No **email/notification** of any kind (purchase confirmation, expiry warning).
- No **reviews, ratings, or seller reputation**.
- No **rate limiting**.

---

## Priority summary

| Tier | Theme | Items |
|------|-------|-------|
| **P0 — Near term** | High value, mostly contained to existing services | ✅ Richer ticket model, ✅ search/filter/pagination, ✅ "My listings" + edit/unlist UI, ✅ buyer order detail/receipt, ✅ email notifications (purchase + expiry) |
| **P1 — Mid term** | New capability, moderate scope | Notifications service, ✅ password reset + email verify, ✅ refunds, seller reputation/reviews, ticket quantity |
| **P2 — Long term** | Platform maturity & scale | ✅ Observability stack, rate limiting, admin dashboard, full-text search engine, ✅ PaymentIntents (provider abstraction still open), wishlists/alerts |

Effort key: **S** ≈ <1 day · **M** ≈ 1–3 days · **L** ≈ 1 week+

---

## P0 — Near term

### 1. Richer ticket model (description, event date, venue, category, image) — ✅ Done
- **Status:** Shipped. Ticket model carries `eventDate`, `venue`, `description`,
  `category`, `imageUrl` (+ `unlisted`); event payloads + orders/payments replicas
  updated; create/edit forms, cards, and detail page render them. Signed Cloudinary
  image uploads and past-date rejection included.
- **Value:** Title + price is too thin for a real marketplace; buyers need
  context and the UI already has space (cards, detail page) for it.
- **Scope:** `tickets` model + create/update routes + validation; extend
  `ticket:created`/`ticket:updated` event payloads in **common**; update the
  `Ticket` replica + listeners in **orders** and **payments**; client forms +
  cards + detail page.
- **Events:** ⚠️ Bumping event payloads touches every consumer — version the
  schema carefully and update all listeners together.
- **Effort:** M

### 2. Server-side search, filter, sort & pagination for listings — ✅ Done
- **Status:** Shipped. `GET /api/tickets` takes `q`, `category`, `minPrice`,
  `maxPrice`, `sort`, `page`, `limit` (regex title/venue search, strict param
  validation → 400). Client has category chips, price range, sort dropdown, and
  pagination. **Extended:** a global navbar search with live typeahead
  suggestions and a dedicated `/search` results page; the hero now uses
  Browse/Sell CTAs instead of an inline search.
- **Follow-up:** swap the regex search for a Mongo text index (or #15) as the
  catalog grows.
- **Effort:** M

### 3. "My listings" management (edit / unlist in the UI) — ✅ Done
- **Status:** Shipped. `/listings` page + a seller tickets endpoint; edit page
  with a shared ticket form; soft-delete via an `unlisted` flag propagated over
  `ticket:updated` to orders/payments (no hard delete). Handles the reserve race
  and returns a clean 400 when editing a concurrently reserved ticket; unlisted
  tickets are hidden from non-owners.
- **Effort:** M

### 4. Buyer order detail & history page — ✅ Done (C5)
- **Status:** Shipped. orders persists `stripeId` + `paidAt` via the
  `payment:created` consumer; the order-detail page renders a real receipt (paid
  stamp, amount, paid-at, Stripe ref) and history shows a paid date + receipt link.
- **Value:** Orders list shows title/status only; no receipt, no purchase date,
  no Stripe reference.
- **Scope:** Persist purchase metadata (charge id, paid-at) — extend
  `payment:created` consumer in **orders**; client order-detail page.
- **Effort:** S–M

### 5. Email confirmation on purchase & expiry warning — ✅ Done
- **Status:** Shipped. A shared `mailer` (nodemailer SMTP) + templates live in
  **common**; `order:created` carries `userEmail` + `ticket.title`.
  - **5a** — **payments** emails an "Admit One" receipt on payment success;
    best-effort (never breaks the webhook) + idempotent (unique `stripeId` index →
    no double receipts).
  - **5b** — **expiration** schedules a second delayed job that fires an
    `expiration:warning` event a configurable lead before the hold lapses;
    **orders** emails "hold expiring soon" only if the order is still unpaid.
  - **5c** — **orders** emails "hold expired" when it cancels an unpaid order on
    `expiration:complete`.
  - Local capture via **Mailpit**; prod swaps the `MAIL_*` env for a real relay
    (Brevo/Resend/SES).
- **Value:** Users get zero feedback outside the app. Highest-impact trust win.
- **Effort:** M

---

## P1 — Mid term

### 6. Notifications service (email + in-app) — 🟢 Mostly done (in-app feed + centralized email)
- **Status:** A dedicated `notifications` service subscribes to `order:created`,
  `payment:created`, `payment:refunded`, `expiration:warning` and
  `expiration:complete`, keeps a small order replica (seeded from `order:created`,
  the only event carrying userId + title + email), and writes an **in-app
  notification feed** per user. REST API (`GET /api/notifications` with unread
  count, `POST /:id/read`, `POST /read-all`) + k8s deployment + ingress route +
  its own Mongo DB (`tickethub-notifications`). Client has a navbar bell with an
  unread badge + dropdown, toasts on new arrivals, and a `/notifications` page.
  Idempotent via the shared `processOnce`; suppresses expiry warnings/cancels for
  already-paid orders.
  - **Centralized email:** the three transactional emails (receipt,
    hold-expiring, hold-expired) are now sent by this service off the same events
    — the inline sends were removed from payments + orders, so it's the single
    comms owner. Verified e2e: each email sent exactly once (no duplicates).
  - **Note:** the seed script now also resets the `tickethub-notifications` DB —
    its `(channel, sequence)` idempotency guard would otherwise collide with a
    fresh NATS stream's reused sequence numbers after a `skaffold` restart.
- **Deferred (next slices):** a **refund email** (in-app "Refund issued" exists;
  email needs a new template + a `common` publish); **price-drop / availability**
  notifications (ties into #16); optional **real-time SSE** delivery.
- **Scope:** New `notifications` service subscribing to `order:created`,
  `payment:created`, `expiration:complete`, etc.; k8s deployment; templating;
  in-app notification feed via the client.
- **Effort:** L

### 7. Account hardening: email verification + password reset — ✅ Done
- **Status:** Shipped. **auth** now publishes over NATS for the first time:
  signup mints a hashed, TTL'd verification token and emits
  `user:verification:requested`; `forgot-password` emits
  `password:reset:requested` (always 200 — no email enumeration). New endpoints:
  verify-email, resend-verification, forgot-password, reset-password. Only token
  *hashes* are stored (raw token rides the event → the email link). The JWT now
  carries `emailVerified`; auth re-issues the cookie on verify/reset.
  **notifications** owns the two new emails (verify + reset), building links from
  `CLIENT_URL` via the centralized mailer. **Gate:** a common `requireVerified`
  middleware blocks **tickets** create and **orders** create until verified
  (403); browsing/sign-in stay open. Client: verify / forgot / reset pages, a
  "Forgot?" link on sign-in, and an unverified banner with one-click resend. Seed
  backfills the demo accounts as verified.
- **Value:** Currently anyone can sign up with any email; passwords can't be
  recovered.
- **Effort:** M

### 8. Refunds & buyer-initiated cancellation — ✅ Done (C4)
- **Status:** Shipped. payments' `order:cancelled` listener issues a Stripe
  refund (idempotency-keyed on the order) when a Payment exists and publishes
  `payment:refunded`; orders frees the ticket on cancel. (Buyer cancels an
  unpaid/paid order via the existing cancel flow.)
- **Value:** Real marketplaces must support refunds; payments only charges.
- **Scope:** **payments** refund route (Stripe refund) + `payment:refunded`
  event; **orders** transitions order to a refunded/cancelled state and frees
  the ticket; client controls + policy windows.
- **Effort:** M

### 9. Seller reputation & reviews/ratings
- **Value:** Trust is the core of a resale marketplace ("Buy & sell with
  confidence" is already the hero copy).
- **Scope:** New `reviews` service (or extend auth with a profile); only buyers
  with a completed order can review; aggregate rating on seller profile + ticket
  cards.
- **Effort:** L

### 10. Ticket quantity / multi-seat listings
- **Value:** Today a "ticket" is a single unit; real listings are "4 seats
  together."
- **Scope:** `quantity` on the ticket model; orders reserve N of M; partial
  reservation logic + the reservation/expiration flow; UI quantity selector.
- **Effort:** L (touches the reservation invariant — design carefully)

### 11. Seller payouts (Stripe Connect)
- **Value:** Money currently goes to the platform, never the seller — not a real
  resale flow.
- **Scope:** Stripe Connect onboarding in **auth/payments**; split charge /
  transfer on `payment:created`; payout dashboard.
- **Effort:** L

---

## P2 — Long term / platform

### 12. Observability: metrics, tracing, structured logs, health checks — ✅ Done (Phase A + D)
- **Status:** Shipped. `/healthz` + `/readyz` probes (Phase A); structured pino
  logs, prom-client metrics → Prometheus + Grafana, OpenTelemetry tracing across
  services + NATS → Jaeger, and AlertManager rules (Phase D). See
  [production-enhancements.md](production-enhancements.md).
- **Value:** No insight into the running system today.
- **Scope:** Prometheus/Grafana, OpenTelemetry tracing across services + NATS,
  structured logging, `/healthz` + readiness probes in k8s manifests.
- **Effort:** L

### 13. Rate limiting & abuse protection
- **Value:** Auth and order endpoints are unprotected against brute force /
  spam.
- **Scope:** Redis-backed rate limiter middleware in **common**; per-IP/per-user
  limits on signin/signup/order creation; CAPTCHA on signup.
- **Effort:** M

### 14. Admin dashboard & moderation
- **Value:** No way to moderate listings, ban users, or inspect orders.
- **Scope:** `role` on the user model (`requireAdmin` middleware in common);
  admin client area; takedown/flag flows.
- **Effort:** L

### 15. Dedicated search engine (Elasticsearch/Meilisearch)
- **Value:** Mongo text search won't cut it at scale or for fuzzy/typo-tolerant
  search and facets.
- **Scope:** New search service fed by `ticket:*` events; client search UX with
  facets & suggestions. (Supersedes the basic part of #2.)
- **Effort:** L

### 16. Wishlists & price-drop / availability alerts
- **Value:** Re-engagement; classic marketplace retention feature.
- **Scope:** Watchlist storage (auth/new service); alert evaluation on
  `ticket:updated`; delivered via Notifications (#6).
- **Effort:** M

### 17. Payment provider abstraction + modern Stripe (PaymentIntents) — ✅ PaymentIntents done (C1–C3)
- **Status:** PaymentIntents + webhooks shipped (C1–C3): server creates the
  intent, client confirms via Stripe.js, and the webhook is the source of truth.
  A provider-agnostic abstraction layer is still open.
- **Value:** Charges API is legacy; PaymentIntents support SCA/3DS and more
  methods. An abstraction eases future providers.
- **Scope:** Refactor **payments** to PaymentIntents + webhooks; client already
  uses Stripe Elements, so mostly backend + a confirm step.
- **Effort:** M

---

## Quick wins (small, independent)

- ~~**Seed/demo data** script so a fresh cluster isn't empty~~ — ✅ Done (`seed/seed.js`
  resets collections + creates demo users/tickets).
- **Ticket detail: show seller + listing date** (needs #1's richer model).
- **Empty-state & loading skeletons** on listings/orders (UI only).
- ~~**`/healthz` endpoints** + k8s liveness/readiness probes~~ — ✅ Done (Phase A).
- **Currency/locale formatting** centralized in a client util (already started
  with `Intl.NumberFormat`).
- **OpenAPI/Swagger** docs per service (developer experience).

---

## Suggested next slice

The post-purchase loop is now closed: #4 (receipts/history) and #8 (refunds)
shipped in Phase C, and the platform-maturity work (#12 observability, #17
PaymentIntents) shipped in Phases A–D. The next coherent increment is **user
feedback + accounts**:

1. **#5 Email confirmation** — ✅ Done (purchase receipt + expiry warning +
   cancellation). The common mailer is now in place.
2. **#6 Notifications service** — 🟡 in-app feed shipped (dedicated service +
   navbar bell + `/notifications` page). Remaining: fold the transactional emails
   into it and add price-drop alerts.
3. **#7 Account hardening** — email verification + password reset.

These build on the now-mature platform (events, observability, payments) and turn
one-off transactions into an engaged, trustworthy experience.
