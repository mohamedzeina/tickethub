# TicketHub — Feature Backlog

A prioritized list of features and improvements, grounded in how the system
currently works. Use this as a living roadmap; check items off or move them
between tiers as priorities shift.

---

## How the system works today (baseline)

TicketHub is an event-driven microservices app (StubHub-style ticket resale).

**Services** (each owns its own MongoDB; communicate over NATS Streaming):

| Service | Responsibility | Routes / jobs |
|---------|----------------|---------------|
| **auth** | Accounts & sessions | signup, signin, signout, currentuser (JWT in a cookie) |
| **tickets** | Ticket listings | create, update, show, list |
| **orders** | Reservations | create (reserves ticket + sets `expiresAt`), cancel, show, list |
| **payments** | Charging | create (Stripe charge via card token) |
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

- Tickets carry only **title + price** — no description, images, event date,
  venue, category, or quantity.
- Listing returns **all unreserved tickets** — no search, filter, sort, or
  pagination on the server.
- No **password reset / email verification**, no user **profile**, no **roles**.
- No **email/notification** of any kind (purchase confirmation, expiry warning).
- No **refunds / cancellation by buyer**, no **receipts/order history detail**.
- No **reviews, ratings, or seller reputation**.
- No **rate limiting**, **observability/metrics**, or **seed data**.

---

## Priority summary

| Tier | Theme | Items |
|------|-------|-------|
| **P0 — Near term** | High value, mostly contained to existing services | Richer ticket model, search/filter/pagination, "My listings" + edit/delete UI, buyer order detail, email confirmations |
| **P1 — Mid term** | New capability, moderate scope | Notifications service, password reset + email verify, refunds, seller reputation/reviews, ticket quantity |
| **P2 — Long term** | Platform maturity & scale | Observability stack, rate limiting, admin dashboard, full-text search engine, payment provider abstraction, wishlists/alerts |

Effort key: **S** ≈ <1 day · **M** ≈ 1–3 days · **L** ≈ 1 week+

---

## P0 — Near term

### 1. Richer ticket model (description, event date, venue, category, image)
- **Value:** Title + price is too thin for a real marketplace; buyers need
  context and the UI already has space (cards, detail page) for it.
- **Scope:** `tickets` model + create/update routes + validation; extend
  `ticket:created`/`ticket:updated` event payloads in **common**; update the
  `Ticket` replica + listeners in **orders** and **payments**; client forms +
  cards + detail page.
- **Events:** ⚠️ Bumping event payloads touches every consumer — version the
  schema carefully and update all listeners together.
- **Effort:** M

### 2. Server-side search, filter, sort & pagination for listings
- **Value:** `GET /api/tickets` currently returns *every* unreserved ticket;
  won't scale and the hero search is client-only.
- **Scope:** `tickets` index route — query params (`q`, `category`, `minPrice`,
  `maxPrice`, `sort`, `page`, `limit`), Mongo text index on title/description;
  client wires the hero search + filter controls to the API.
- **Effort:** M

### 3. "My listings" management (edit / delete in the UI)
- **Value:** The `update` route exists but there's no UI; sellers can't manage
  listings, and there's no delete at all.
- **Scope:** Client page listing the current user's tickets; wire to existing
  `PUT /api/tickets/:id`; add a **soft-delete/unlist** route + `ticket:updated`
  flag (avoid hard delete so orders/payments replicas stay consistent).
- **Effort:** M

### 4. Buyer order detail & history page
- **Value:** Orders list shows title/status only; no receipt, no purchase date,
  no Stripe reference.
- **Scope:** Persist purchase metadata (charge id, paid-at) — extend
  `payment:created` consumer in **orders**; client order-detail page.
- **Effort:** S–M

### 5. Email confirmation on purchase & expiry warning
- **Value:** Users get zero feedback outside the app. Highest-impact trust win.
- **Scope:** Quick version — a small mailer in **payments** (on `payment:created`)
  and **orders**; better version folds into the Notifications service (P1).
  Use a provider (Postmark/SendGrid/SES) or MailHog locally.
- **Effort:** M

---

## P1 — Mid term

### 6. Notifications service (email + in-app)
- **Value:** Centralizes all comms (order confirmed, ticket sold, reservation
  expiring/expired, price drop). Clean fit for the event-driven model.
- **Scope:** New `notifications` service subscribing to `order:created`,
  `payment:created`, `expiration:complete`, etc.; k8s deployment; templating;
  in-app notification feed via the client.
- **Effort:** L

### 7. Account hardening: email verification + password reset
- **Value:** Currently anyone can sign up with any email; passwords can't be
  recovered.
- **Scope:** **auth** — verification tokens, reset tokens (TTL), email sending
  (via Notifications/mailer); client flows (verify, forgot/reset password).
- **Effort:** M

### 8. Refunds & buyer-initiated cancellation
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

### 12. Observability: metrics, tracing, structured logs, health checks
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

### 17. Payment provider abstraction + modern Stripe (PaymentIntents)
- **Value:** Charges API is legacy; PaymentIntents support SCA/3DS and more
  methods. An abstraction eases future providers.
- **Scope:** Refactor **payments** to PaymentIntents + webhooks; client already
  uses Stripe Elements, so mostly backend + a confirm step.
- **Effort:** M

---

## Quick wins (small, independent)

- **Seed/demo data** script so a fresh cluster isn't empty (helps demos & dev).
- **Ticket detail: show seller + listing date** (needs #1's richer model).
- **Empty-state & loading skeletons** on listings/orders (UI only).
- **`/healthz` endpoints** + k8s liveness/readiness probes (reliability, S).
- **Currency/locale formatting** centralized in a client util (already started
  with `Intl.NumberFormat`).
- **OpenAPI/Swagger** docs per service (developer experience).

---

## Suggested first slice

A coherent, demoable increment that builds on the new UI:

1. **#1 Richer ticket model** (description, date, venue, image) — unlocks the
   card/detail UI that already has the space.
2. **#2 Server-side search/filter/pagination** — makes the hero search real.
3. **#3 My listings (edit/delete)** + **#4 buyer order detail**.
4. **#5 Email confirmation** — first real user feedback loop.

These stay mostly within existing services, exercise the event-versioning
discipline, and produce a visibly more complete marketplace.
