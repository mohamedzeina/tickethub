# Seed script

Resets every TicketHub database and seeds demo data. **Every run drops all the
service databases first**, so it always starts from a clean slate.

What it creates:

- Two users — `test@test.com` and `test2@test.com`, both with password `123456`
- 8 nice demo tickets split across the two users (so you can browse, buy the
  other person's tickets, and see the "this is your listing" notice on your own)

Tickets are created through the HTTP API (not inserted straight into Mongo), so
the `ticket:created` events fire and the orders service replica stays in sync.

## Prerequisites

- The cluster is running and reachable at `https://tickethub.com`
  (the dev ingress host).
- `kubectl` is pointed at the cluster (used to read the Mongo connection
  strings from the `mongo-secret` secret), **or** you pass the URIs as env vars.

## Run

```bash
cd seed
npm install
npm run seed
```

## Config (optional env vars)

| Var | Default | Purpose |
| --- | --- | --- |
| `BASE_URL` | `https://tickethub.com` | API base URL |
| `HOST_HEADER` | – | Override the `Host` header (when `BASE_URL` is an IP) |
| `AUTH_MONGO_URI` etc. | read from `mongo-secret` | Mongo connection strings |

Example with explicit URIs:

```bash
AUTH_MONGO_URI="mongodb+srv://…/tickethub-auth" \
TICKETS_MONGO_URI="mongodb+srv://…/tickethub-tickets" \
ORDERS_MONGO_URI="mongodb+srv://…/tickethub-orders" \
PAYMENTS_MONGO_URI="mongodb+srv://…/tickethub-payments" \
npm run seed
```

> Note: the local dev ingress uses a self-signed cert, so the script relaxes TLS
> verification **only** when targeting `tickethub.com`. For any other host it
> keeps verification on (set `NODE_TLS_REJECT_UNAUTHORIZED=0` yourself if needed).
