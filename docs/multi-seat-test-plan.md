# Multi-seat (#10) — manual QA test plan

A click-through checklist to verify the quantity-pool feature end to end in the
running app. Pairs with the automated coverage:

- **Unit:** `cd <service> && npx jest` (tickets, orders, payments, admission,
  notifications, wishlists each have multi-seat cases).
- **Live e2e:** `node e2e/multi-seat.js` (30 checks, needs the env below). The
  steps here mirror that suite, but by hand through the UI.

---

## Prerequisites

1. Bring up the dev stack (cluster + skaffold + mailpit + stripe):
   ```sh
   bash scripts/dev.sh
   ```
   Wait until every pod is `Ready` and the log shows stripe `Ready!`.
2. Reseed for a clean baseline:
   ```sh
   cd seed && npm run seed
   ```
3. Open the app at **https://tickethub.com** (accept the self-signed cert).
4. Mailpit (for the email checks): **http://localhost:8025**
5. Two accounts: sign in as **test@test.com** / `123456` (seller) and register a
   second account as the buyer. Both must be email-verified to buy/sell.
6. Test card: `4242 4242 4242 4242`, any future date, any CVC.

> Tip: after testing, reseed again so the demo isn't left with QA junk.

---

## 1. Seller — list a multi-seat ticket
- [ ] As the seller, go to **Sell a Ticket**.
- [ ] The form has a **Quantity (seats)** field next to **Price (per seat)**.
- [ ] Create a listing with **Quantity = 4**, price €30. → redirected to **My Listings**.
- [ ] Try creating one with Quantity `0` or `2.5` → rejected with a validation error.

**Expected:** quantity 1–20 only; whole numbers.

## 2. Browse — availability on the card
- [ ] Find the listing on the home board / search.
- [ ] The card shows **"4 AVAILABLE"** in the footer (not "ADMIT ONE") and the
      Admit cell shows **4**.

## 3. Ticket detail — selector, live total, availability
- [ ] Open the listing. Admission row reads **"Up to 4 · 4 available"**; price says
      **"per seat"**.
- [ ] As the buyer, a **Seats** dropdown (1–4) appears with a live total that
      updates: pick 3 → shows **3 × €30** and **€90**; the tear button reads
      **"Tear here — buy 3 seats"**.
- [ ] (Signed out) instead shows **"Sign in to buy"**.
- [ ] (As the seller / owner) shows "Your listing" with an **Edit listing** link.

## 4. Partial buy — the listing stays on sale
- [ ] As the buyer, buy **3 of 4** seats (tear to reserve → pay €90 → settle).
- [ ] Back on the board, the listing is **still visible**; card now shows **"1 AVAILABLE"**.
- [ ] Detail page shows **"Up to 4 · 1 available"**.

**Expected:** reserving a subset doesn't remove the listing; availability drops by N.

## 5. Oversell guard + sold-out
- [ ] As a second buyer, on the same listing try to buy **2** when only **1** remains
      → error **"Only 1 seat left"**.
- [ ] Buy the final **1** seat.
- [ ] The listing now **disappears from the board/search**; detail page shows a
      **"Sold out"** state (no buy controls).

## 6. Payment total = price × N
- [ ] On the 3-seat order's checkout, **Total Due** is **€90** with a **"3 × €30"**
      sub-line; the pay button says **"Validate & Pay €90.00"**.
- [ ] The Stripe charge is for €90 (check the receipt / Stripe dashboard).

## 7. Admission — one pass per seat, redeemed independently
- [ ] On the paid 3-seat receipt, the **Admission Passes · 3 seats** section shows
      **3 QR cards** labelled **Seat 1 / Seat 2 / Seat 3**, each with its own
      "Copy gate code".
- [ ] Open **/gate** (needs the gate key). Scan **Seat 1's** code → admits (valid).
- [ ] Scan **Seat 2's** code → admits independently.
- [ ] Re-open the receipt: Seat 1 & 2 show **"✓ Checked in"**, Seat 3 still has a
      live QR.
- [ ] Re-scan Seat 1 → refused ("already redeemed").

## 8. Receipt + seller emails (Mailpit)
- [ ] Buyer's **receipt email**: shows a **SEATS 3 × €30** line and **AMOUNT €90**.
- [ ] Seller's in-app **"Your ticket sold"** notification (bell — there's no seller
      email): names **(3 seats)** and the **€90** total (not €30).

## 9. Refund — releases seats AND revokes every pass
- [ ] Buy a fresh multi-seat order (e.g. 3 seats on a new listing), pay, settle —
      but **don't scan** any pass.
- [ ] On the receipt, **Request refund → Confirm**. Copy mentions the full total.
- [ ] After it settles: all **3 passes show "Pass revoked"**; scanning any at /gate
      is refused.
- [ ] The listing's availability **goes back up** by 3 and it's buyable again.

## 10. Cancel an unpaid hold — releases seats
- [ ] Reserve all seats of a 2-seat listing but **don't pay**.
- [ ] The listing goes to **0 available** (sold out / hidden).
- [ ] From **My Orders**, cancel the unpaid hold (or let it expire).
- [ ] Availability returns to **2** and the listing is back on the board.

## 11. Seller edit/unlist freezes after a sale
- [ ] On a listing with **no** reservations: seller can **Edit** and **Unlist**.
- [ ] After **any** seat is reserved/sold (`availableQty < quantity`): **Edit** and
      **Unlist** are hidden in My Listings, and the status reads
      **"Selling · N left"**; hitting the edit URL directly redirects away.
- [ ] Editing quantity is only possible while **fully available**.

## 12. Wishlist availability alert (optional)
- [ ] Buyer **saves** (♥) a listing, then it sells out, then a buyer **refunds** /
      a hold frees a seat.
- [ ] The saver gets a **"Back on sale"** notification + email (availability flips
      on `availableQty > 0`, so a partial sale alone does **not** fire it — only
      0 → >0).

---

### Quick regression sanity
- [ ] A plain **single-seat** listing (quantity 1) still reads "ADMIT ONE" /
      "One (1) Person", charges the unit price, and mints exactly one pass — the
      multi-seat changes don't alter the single-unit experience.
