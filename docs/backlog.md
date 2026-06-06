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
- ✅ Rate limiting on auth endpoints (per-email/user + per-IP) — done (#13).

---

## Priority summary

| Tier | Theme | Items |
|------|-------|-------|
| **P0 — Near term** | High value, mostly contained to existing services | ✅ Richer ticket model, ✅ search/filter/pagination, ✅ "My listings" + edit/unlist UI, ✅ buyer order detail/receipt, ✅ email notifications (purchase + expiry) |
| **P1 — Mid term** | New capability, moderate scope | Notifications service, ✅ password reset + email verify, ✅ refunds, ✅ seller reputation/reviews, ticket quantity |
| **P2 — Long term** | Platform maturity & scale | ✅ Observability stack, ✅ rate limiting, admin dashboard, full-text search engine, ✅ PaymentIntents (provider abstraction still open), wishlists/alerts |

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

### 9. Seller reputation & reviews/ratings — ✅ Done (core)
- **Status:** Shipped. New `reviews` service (clones the notifications pattern):
  consumes `ticket:created`/`updated` (ticket→seller map), `order:created` +
  `payment:created`/`order:cancelled` (order replica + completion gate). REST:
  `POST /api/reviews` (gated — buyer + Complete order + one-per-order, seller
  taken from the replica not the client), `PUT /api/reviews/:id` (edit own),
  `GET /api/reviews/seller/:sellerId` (public aggregate + list), `GET
  /api/reviews/order/:orderId` (receipt state). Client: `Stars`, seller badge on
  ticket detail, review form on the completed-order receipt, `/sellers/:userId`
  profile. Sellers/buyers shown as opaque handles (accounts have no username).
  Verified: 18 unit tests + live e2e `e2e/reviews.js` (17 checks — replication +
  all gates). The completed-order→review happy path is unit-tested (e2e can't
  settle Stripe).
- **Follow-up done (2026-06-06):** per-card ratings on listings — browse/search
  cards show a seller star badge, batch-resolved via `GET
  /api/reviews/sellers?ids=…` (client `useSellerRatings` hook, no N+1, reviews +
  client only). Covered by reviews unit tests + live `e2e/per-card-ratings.js`.
- **Deferred:** seller responses to reviews; real usernames (vs. handles);
  refunded-order review policy.
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
- **Scope:** Connect **Express** onboarding in auth (Stripe-hosted KYC); **separate
  charge + delayed transfer** released by payments once an order passes its refund
  window (`refundableUntil`) — so refunds need no clawback; earnings held until a
  seller connects; platform fee. New subjects `account:payouts-enabled`,
  `order:payout-due`. Phased: onboarding-only → payout release → polish.
- **Design:** see [`docs/11-seller-payouts.md`](./11-seller-payouts.md).
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

### 13. Rate limiting & abuse protection — ✅ Done (auth)
- **Status:** Shipped. A reusable `rateLimiter()` middleware in **common**
  (`rate-limiter-flexible` + `ioredis`, memory backend under test, **fails open**
  if Redis is down) + a `TooManyRequestsError` (429 + `Retry-After`) and a
  `rate_limit_rejections_total` metric. Applied to the auth endpoints in two
  tiers: tight per-email/per-user limits (signin 5/15min·email,
  forgot-password 3/hr·email, resend-verification 3/hr·user) as the real
  brute-force/flood protection, plus generous per-IP backstops on
  signin/signup/forgot/verify/reset. New dedicated `ratelimit-redis` (no
  persistence — counters are ephemeral). Live e2e: `e2e/abuse.js`.
- **Deferred:** order-creation throttle; CAPTCHA on signup.
- **Follow-up — per-IP client-IP correctness (verify on deploy):** Local probing
  confirmed per-IP limiting *works* (trips at the cap) and is *not* spoofable via
  a forged `X-Forwarded-For` (the ingress sanitizes it). What can't be checked
  locally (single source IP): that **distinct real users land in distinct
  buckets** vs. all sharing one SNAT'd/internal IP. Depends on prod LB
  `externalTrafficPolicy` (`Local` preserves client IP; `Cluster` SNATs to the
  node) + ingress `use-forwarded-headers`. **On deploy:** hit
  `/api/users/forgot-password` 60+ times from two networks (laptop + phone on
  cellular) and confirm each gets its own 60 before 429. Worst case is benign
  (per-email/per-user limits unaffected; per-IP caps are generous). Also harden
  `app.set('trust proxy', true)` → `trust proxy: 1` (trust one hop) now that the
  ingress is the only proxy.
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

### 16. Wishlists & price-drop / availability alerts — ✅ Done (price-drop, 2026-06-06)
- **Status:** Shipped. New `wishlists` service: `POST/DELETE /api/wishlists`,
  `GET /api/wishlists` (+`/ids`), a ticket replica fed by `ticket:created/updated`
  that **detects a price drop** (version-guarded) and emits
  `wishlist:price-dropped` per watcher → notifications delivers an in-app alert +
  email. Client: heart toggle on cards + ticket detail (`useWishlist`), a
  `/wishlist` page, and a UserMenu link. The **"new review" seller notification**
  (`review:created`) shipped in the same `common` bump. Covered by unit tests +
  live `e2e/wishlists.js` (11 checks).
- **Deferred:** availability/relist alerts (unlisted→listed) — the replica already
  tracks `unlisted`, so it's a cheap fast-follow.
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

### 18. User display names (seller identity) — ✅ Done (2026-06-04)
- **Shipped:** nullable public `displayName` on auth + `PATCH /api/users/me`,
  public `GET /api/users/:id` and batch `GET /api/users?ids=` (display fields
  only, kept out of the JWT); client `useDisplayName(id)` resolver (handle
  fallback) wired into `SellerBadge` + the `/sellers/:id` heading; an `/account`
  page with the "set your name" form (+ "Account" nav link); seed gives
  test/test2 the names "Avery Stone" / "Jordan Reyes". **Decisions settled at
  build:** edit UI lives on a dedicated `/account` page; **buyers stay opaque
  handles** (only sellers are named); public reads reuse the existing per-IP
  ingress limiting (no dedicated limiter). Covered by 13 auth unit tests + a live
  `e2e/display-names.js` suite (24 checks, green).
- **Value:** #9 reviews currently show opaque "Seller A1B2" handles, which read
  as placeholders and undercut the trust the feature exists to build. A human
  name on the badge + seller profile is the fix.
- **Approach (decided):** A nullable, public, editable `displayName` — **not** a
  unique username (deferred), **not** required at signup. Resolved by the
  **client (BFF) via a public read on auth**, NOT an event/replica: the name is
  display-only (no service reasons about it) and mutable/shared (a rename must
  reflect live), so replicating it into reviews would be the wrong pattern and
  add reviews↔auth coupling. The reviews service and `common` stay **unchanged**.
  The existing "Seller XXXX" handle remains the fallback when `displayName` is
  unset (so no backfill / no broken old accounts).
- **Scope:**
  - **auth:** add nullable `displayName` to the User model (trim, ~1–40 chars,
    strip control chars); include it in `currentuser`/signin/signup responses;
    `PATCH /api/users/me` (requireAuth) to set it; **public** `GET /api/users/:id`
    → `{id, displayName}` (display fields only — never email/tokens) and a batch
    `GET /api/users?ids=a,b,c` (cap ≤50) to avoid N+1 on lists. Keep it OUT of the
    JWT (not an auth decision; avoids re-issue on rename).
  - **client:** a "set your name" UI (account/settings or navbar dropdown); a
    small browser-side name resolver (`useDisplayName(id)` / `<SellerName>`),
    falling back to the handle; wire into `SellerBadge` (ticket detail) and the
    `/sellers/:id` profile heading; batch-resolve names in the profile's review
    list. Browser-side fetch keeps it non-blocking + isolated (degrades to handle
    if auth hiccups).
  - **seed:** give test/test2 display names so the demo shows real names.
  - **e2e:** set a name via `PATCH`, assert `GET /api/users/:id` + batch return
    it; optionally assert it renders where the handle was.
- **Open sub-decisions (settle at build time):** where the edit UI lives;
  whether **buyers** also get names or stay handles for privacy (lean: sellers
  named, buyers stay handles); public-read rate limiting (ties to #13).
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

The post-purchase loop, platform maturity, comms, and account security are all in:
#4 (receipts/history) + #8 (refunds) shipped in Phase C; #12 observability + #17
PaymentIntents in Phases A–D; #5 emails + #6 Notifications service (in-app feed +
centralized transactional email); and **#7 account hardening** (email
verification + password reset, with a `requireVerified` gate on buy/sell).

The next coherent increment is **abuse protection**:

1. **#13 Rate limiting & abuse protection** — the natural follow-on to #7. We just
   added password-reset, verify, and resend-verification endpoints; together with
   signin/signup they're all brute-force / spam targets and currently unthrottled.
   Redis is already in the cluster, so a shared limiter middleware in **common**
   is a contained **M**. Recommended next.
2. **#9 Seller reputation & reviews** (L, new service) — biggest trust win once
   the platform is hardened.
3. **#6 tail** — refund email + price-drop alerts (small/medium follow-ups).

These build on the now-mature platform (events, observability, payments, comms,
verified accounts) and harden it for real-world traffic.
