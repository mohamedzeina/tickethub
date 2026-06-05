# #11 — Seller payouts (Stripe Connect)

**Status:** Design. **Effort:** L. Depends on the existing payments (C1–C3) +
refund (window) flows.

## Problem

A buyer's payment lands entirely in the **platform's** Stripe account; sellers
never get paid. Without payouts this isn't a real resale marketplace — it's a
store that sells other people's tickets and keeps the money.

## Goal

Let a seller connect a Stripe account, get verified, and automatically receive
their share of each sale (minus a platform fee), with refunds handled cleanly.

## Decisions (locked unless noted)

1. **Account type: Stripe Connect _Express_.** Stripe hosts the onboarding UI and
   owns KYC/identity/bank verification and compliance; we just store the
   `acct_…` id. (Standard = seller runs their own full dashboard, more friction;
   Custom = we build all onboarding + own all liability.)
2. **Money flow: separate charge + _delayed_ transfer**, NOT a destination charge.
   The buyer pays the platform now; we create the seller transfer **later**, once
   the order is past its refund window. (Rationale below.)
3. **Payout timing: after the refund window closes** — `refundableUntil =
   min(paid+24h, event−48h)` (the value orders already computes). This is the key
   decision and it makes refunds trivial — see below.
4. **Selling is NOT gated on payout setup.** A seller can list and sell before
   connecting; their earnings are **held** and released once they finish Connect
   onboarding. (Better conversion than blocking the sell flow; we just nudge.)
5. **Platform fee:** a flat percentage (`PLATFORM_FEE_BPS`, default e.g. 1000 =
   10%). With separate transfers the "fee" is simply the amount we don't transfer.
6. **Single currency (USD) for v1.**

### Why after-window payout (decision 3) is the crux

Our refund window and our payout release are mutually exclusive in time:

- A refund is only allowed **while** `now < refundableUntil` (orders' `isRefundable`).
- A payout is only released **at/after** `refundableUntil`.

So **no refund can ever happen after a payout** — by construction. That means we
never need `reverse_transfer` / clawbacks / negative-balance handling on the
seller's account for the normal flow. Funds sit on the platform during the entire
risk window (refunds, redeemed-pass disputes), then move once. This is the single
biggest reason to prefer delayed transfers over a destination charge that pays the
seller at sale time.

## Onboarding flow (Connect Express)

```
Seller → "Set up payouts" (account page)
  → auth: POST /api/users/connect/onboard
      stripe.accounts.create({ type: 'express', ... })   → acct_…   (store on user)
      stripe.accountLinks.create({ account, type: 'account_onboarding',
                                   return_url, refresh_url })        → one-time URL
  → redirect seller to the Stripe-hosted onboarding page (Stripe does KYC + bank)
  → seller returns to return_url
  → auth: GET /api/users/connect/status  (or the account.updated webhook)
      reads account.charges_enabled / payouts_enabled / details_submitted
      → flips user.payoutsEnabled, publishes account:payouts-enabled
```

Express dashboard (seller views their own payouts/balance): mint a login link on
demand with `stripe.accounts.createLoginLink(acct)` — no UI to build. We add a
thin in-app "earnings" summary on top.

In **test mode** the hosted onboarding has a test path (fake SSN `000-00-0000`,
test routing/account numbers), so this is fully demoable locally.

## Money flow (sale → payout)

```
buyer pays  → payments PaymentIntent on the PLATFORM account (unchanged)
            → payment_intent.succeeded webhook → payment:created (unchanged)
            → orders sets order Complete (unchanged)

[refund window open: refunds allowed; funds stay on platform]

refundableUntil reached (order Complete, not refunded, not …):
  orders schedules a release at refundableUntil (delayed job, like expiration)
        → publishes order:payout-due { orderId, sellerId, amount }
  payments PayoutDueListener:
        look up seller's connected acct (replica from account:payouts-enabled)
        if enabled:  stripe.transfers.create({ amount: amount − fee, currency,
                       destination: acct, source_transaction: charge_id })
                     record Payout(status: 'paid')
        if NOT enabled (seller hasn't connected yet):
                     record Payout(status: 'pending_account')  ← held
  later, when account:payouts-enabled arrives:
        payments releases all that seller's pending_account payouts
```

Notes:
- `source_transaction: <charge id>` ties the transfer to the originating charge so
  it draws from that charge's funds and respects availability — the right way to
  transfer per-sale rather than from a commingled balance.
- The transfer is **idempotent** on `orderId` (one Payout per order, unique index)
  — `order:payout-due` redelivery / a sweep retry can't double-pay. Mirrors the
  refund idempotency we just shipped.
- **Refunds need no change here.** A refund happens before `refundableUntil`, so
  `order:payout-due` never fires for a refunded order (orders cancels the delayed
  job on refund / the job checks status before publishing).

## Data model & ownership

Each service owns its data; payments owns the Stripe money so it must initiate the
transfer, and it replicates the two facts it needs (seller→acct, release time).

- **auth (users):** `stripeAccountId?: string`, `payoutsEnabled: boolean`.
  Emits **`account:payouts-enabled`** `{ userId, stripeAccountId }` when onboarding
  completes (and `account:payouts-disabled` if Stripe later disables an account).
- **orders:** owns `refundableUntil` already. Adds a scheduler (reuse the
  expiration-service delayed-job pattern, or a periodic sweep) that emits
  **`order:payout-due`** `{ orderId, sellerId, amount }` when a Complete,
  non-refunded order passes its window. `sellerId` comes from the order's ticket
  (already replicated) — or carry it through.
- **payments:** new **`Payout`** model `{ orderId (unique), sellerId,
  stripeAccountId?, amount, fee, transferId?, status: 'pending_account' |
  'paid' | 'failed' }`. New listeners: `AccountPayoutsEnabledListener`
  (seller→acct replica + release held payouts) and `OrderPayoutDueListener`
  (create the transfer). Reuses the `stripe` client it already has.

### New NATS subjects
`account:payouts-enabled`, `account:payouts-disabled`, `order:payout-due` — must
be added to `common` `STREAM_SUBJECTS` (the publish-503 gotcha) and the `Subjects`
enum, then `common` republished + consumers bumped.

## Client

- **Account page:** "Set up payouts" button → onboarding redirect; status banner
  ("Payouts active" / "Finish setting up payouts to get paid"); an **Earnings**
  summary (pending vs paid) + a "View payout details" link (Express dashboard).
- **Sell flow:** not gated, but show a one-time nudge if `!payoutsEnabled`
  ("You can sell now — set up payouts to collect your earnings").
- A seller with held earnings sees "$X waiting — set up payouts."

## Edge cases

- **Sold before connecting:** earnings held as `pending_account`, released on
  `account:payouts-enabled`. ✅ by design.
- **Onboarding abandoned / `details_submitted` but not `payouts_enabled`:** treat
  as not-enabled; keep holding; the account.updated webhook flips it when Stripe
  finishes verification.
- **Stripe later disables an account** (failed verification, risk): stop releasing;
  `account:payouts-disabled` → hold again.
- **Refund vs payout race:** impossible by construction (window < release). If we
  ever shorten the window below the release, we'd need `reverse_transfer` — call
  out in code so the invariant isn't silently broken.
- **Disputes after payout** (post-event chargeback): platform liability, rare for
  tickets post-event. Accepted for v1; revisit with #14 (admin) + a disputes flow.
- **Partial/zero fee, rounding:** fee computed in integer cents; transfer =
  `amount_cents − floor(amount_cents × bps / 10000)`.

## Testing (definition of done: unit + live e2e)

- **Unit:** onboarding endpoints (account create + link, status); `account.updated`
  webhook → `payoutsEnabled`; `OrderPayoutDueListener` creates a transfer with the
  right amount/fee/destination (mock Stripe); held→released on
  `account:payouts-enabled`; idempotency (one Payout per order).
- **Live e2e (`e2e/payouts.js`):** Connect's hosted onboarding is interactive, so
  use the **test-mode API shortcut** to mark a connected account `payouts_enabled`
  without the hosted page (create the Express account + add a test external account
  + accept TOS via API). Then: seller connects → buyer buys + settles (existing
  Stripe-CLI settle) → fast-forward the window (`REFUND_WINDOW_HOURS=0` /
  `REFUND_EVENT_CUTOFF_HOURS=0` for the test, or a test-only release trigger) →
  assert a `transfer` to the connected account exists (`stripe.transfers.list({
  destination })`) for `amount − fee`, and that a refund attempt past the window is
  rejected. Also assert the **held→released** path (sell first, connect after).

## Phasing

1. **Onboarding only** (no money moves): auth account-create/link/status +
   `account.updated` webhook + `payoutsEnabled`; client "Set up payouts" + status.
   Sellers can connect; nothing pays out yet. Shippable + demoable on its own.
2. **Payout release:** orders `order:payout-due` scheduler; payments `Payout` model
   + `OrderPayoutDueListener` transfer + `pending_account` hold/release; client
   earnings summary. The actual money movement.
3. **Polish:** fee config surfaced, Express dashboard login link, nudges,
   disabled-account handling.

## Open questions

- Platform fee %? (default 10% / `PLATFORM_FEE_BPS=1000` assumed)
- Gate selling on payouts, or hold-and-collect-later? (assumed: hold-and-collect)
- Single currency only for v1? (assumed: yes, USD)
- Pay out per-sale, or batch a seller's due sales into one transfer? (assumed:
  per-sale for simplicity + clean idempotency; batching is a later optimization)
