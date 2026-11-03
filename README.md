# Reason Support

Internal platform for the Reason Clothing support team. It sits on top of Gorgias, Shopify and A2000 and adds:
urgent-ticket detection, proactive order-problem alerts, and an activity log.

**Status: Phase 4:** login, Gorgias sync + webhooks, urgency scoring, Urgent Tickets dashboard, Slack alerts, settings, Shopify (multiple stores) + Order Problems monitor, notify-customer flow with templates (single + bulk), A2000 stock adapter.

This app sits between Shopify (where customers order), A2000 (the ERP and source of truth for warehouse stock) and Gorgias (where the support team talks to customers).

> v1 never sends anything to customers automatically. Every customer-facing message requires an agent click.

## Architecture

- **Web app:** Next.js 16 (App Router) + TypeScript + Tailwind. Serves the dashboard, server actions and webhook endpoints.
- **Worker:** `worker/index.ts` (node-cron). Polls Gorgias every 3 min, processes stored webhook events and refreshes agents hourly. Run it as a second process next to the web app.
- **Database:** PostgreSQL via Prisma. This is a local cache of tickets and messages, so the dashboard never waits on Gorgias.
- **Integrations:** `lib/gorgias/*`. All HTTP goes through `lib/http.ts` (rate limiter + retry with exponential backoff, honours `Retry-After`).

```
app/(dash)/          dashboard pages (home, urgent, activity)
app/api/webhooks/    Gorgias (and later Shopify) webhook receivers
lib/gorgias/         API client, sync, pure conversation logic
worker/              background jobs
scripts/             create users, demo data, one-off sync
prisma/              schema + migrations
tests/               vitest unit tests
```

## Local setup

Requirements: Node 20+ and Postgres 16 (or Docker).

```bash
npm install
cp .env.example .env              # fill in values (see below)
docker compose up -d              # local Postgres (skip if you have one)
npx prisma migrate dev            # create tables
npm run user:create -- you@reasonclothing.com "a-long-password" "Your Name" --admin
npm run dev                       # http://localhost:3000
npm run worker                    # in a second terminal
```

No keys yet? Run `npm run seed:demo` to load 6 fake tickets plus 7 orders in two demo Shopify stores. Remove them with `npm run demo:clear` before going live.

Tests: `npm test`. Type check: `npm run typecheck`.

## Configuration (.env)

| Variable | What |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Random string, `openssl rand -base64 32` |
| `ALLOWED_EMAIL_DOMAIN` | Only these emails can sign in (default `reasonclothing.com`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Optional Google login (see below) |
| `GORGIAS_DOMAIN` | `reason-clothing` |
| `GORGIAS_EMAIL` / `GORGIAS_API_KEY` | REST API credentials |
| `GORGIAS_WEBHOOK_SECRET` | Shared secret for the HTTP integration |
| `GORGIAS_BACKFILL_DAYS` | First sync imports open tickets updated in the last N days (default 14) |
| `GORGIAS_POLL_CRON` | Poll schedule (default every 3 minutes) |
| `GORGIAS_RATE_LIMIT` | Max calls per 20s per process (Gorgias allows 40; default 30) |
| `SLACK_WEBHOOK_URL` | Optional. Slack incoming webhook for urgent/threat alerts |
| `ANTHROPIC_API_KEY` | Optional. Enables Claude tone/threat classification |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-opus-5-5`; `claude-haiku-5-5` is far cheaper for high volume |
| `AI_MAX_PER_RUN` | Max Claude calls per scoring run (default 25) |

## Users and login

- **Password users:** `npm run user:create -- email password "Name" [--admin]`. Re-running it updates the password.
- **Google login:** create an OAuth client (Google Cloud Console → APIs & Services → Credentials → OAuth client ID → Web application). Add the redirect URI `https://YOUR_APP_URL/api/auth/callback/google` and put the ID and secret in `.env`. Anyone with a verified `@reasonclothing.com` Google account can then sign in, and a user is created on first login.
- Platform users are linked to Gorgias agents by email. This is used for "Assign to me" in Phase 2.

## Gorgias setup

### 1. API key

1. In Gorgias go to **Settings → REST API** (admin access needed).
2. Copy the **Base API URL** (should be `https://reason-clothing.gorgias.com/api/`), the **Username** (your email) and click **Create API Key**.
3. Put them in `.env` as `GORGIAS_EMAIL` and `GORGIAS_API_KEY`.
4. Test it: `npm run sync:gorgias`. It prints how many agents and tickets were imported.

### 2. HTTP integration (near real-time updates)

Polling every 3 minutes works without this. Webhooks make new messages show up within seconds.

1. Gorgias → **Settings → HTTP integration → Add HTTP integration**.
2. Name: `Reason Support`. URL: `https://YOUR_APP_URL/api/webhooks/gorgias`.
3. Triggers: **Ticket created** and **Ticket message created**.
4. Method: `POST`, Request content type: `application/json`.
5. Headers: add `X-Webhook-Secret` with the same value as `GORGIAS_WEBHOOK_SECRET`.
6. Request body:
   ```json
   { "ticket_id": "{{ticket.id}}", "event": "ticket-message-created" }
   ```
7. Save. You can check deliveries under the integration's **Events** tab.

The endpoint stores the event, replies right away, and then re-syncs the ticket in the background. Any event left unprocessed is picked up by the worker within a minute.

## Shopify setup (each store)

1. **Get an Admin API access token** (`shpat_...`). Use the Shopify Dev Dashboard (or, for an existing admin-created custom app: **Settings → Apps → Develop apps**). It needs these Admin API scopes: `read_orders`, `read_products`, `read_inventory`, `read_locations`, `read_customers`, `read_fulfillments`. Add `read_all_orders` if you want orders older than 60 days.
2. Copy the app's **API secret key** too. Shopify signs webhooks with it.
3. Add the store to `.env` (see `.env.example`): `SHOPIFY_STORES`, then `SHOPIFY_<KEY>_DOMAIN`, `_TOKEN`, `_WEBHOOK_SECRET` and an optional `_NAME`.
4. Test the token: `npm run shopify -- check`
5. Run the first sync: `npm run shopify -- sync`. This imports orders updated in the last 30 days plus all open unfulfilled orders, the stock for those items, and then detects problems.

### Register Shopify webhooks

These are optional, because the worker polls every 5 minutes. With webhooks, cancellations and stock changes show up within seconds.

- **Automatic:** set `APP_URL` to the public HTTPS URL, then run `npm run shopify -- webhooks`. This creates `orders/cancelled`, `orders/updated` and `inventory_levels/update` subscriptions pointing at `APP_URL/api/webhooks/shopify/<store key>`. Running it again is safe.
- **Manual alternative:** Shopify admin → **Settings → Notifications → Webhooks → Create webhook**. Use the same three events, JSON format and URL. Webhooks created this way are signed with the secret shown on that page, so use it as `SHOPIFY_<KEY>_WEBHOOK_SECRET`.

Every webhook is checked with `X-Shopify-Hmac-Sha256`. The app then re-fetches the order or stock over GraphQL, so it never trusts the payload alone.

## Order problems

Detection lives in `lib/problems/detect.ts`, a pure function with unit tests in `tests/oversold.test.ts`.

| Problem | Rule |
| --- | --- |
| Cancelled | Cancelled in the last 14 days. Shows the reason (customer, fraud check, payment declined, inventory, staff…) and the refund status (full, partial, none). |
| Out of stock | An unfulfilled order contains a tracked item with **nothing on hand**. |
| Oversold | Some stock exists, but not enough for every open order. Stock goes to the oldest orders first, and the newer orders that can't be covered are flagged. Each card shows how many units are short. |
| Delayed | Unfulfilled for more than 3 days. Orders still waiting on payment are skipped. |

**Why on-hand and not "available":** Shopify's *available* already subtracts units reserved for unfulfilled orders. *Available = 0* often just means the open orders took the last units, which is fine. So we compare open-order demand with **on-hand** stock instead. Demand also uses Shopify's *committed* count, so older orders outside our sync window are included. When A2000 is connected (Phase 5), the lower of Shopify and A2000 stock is used.

**Other behaviour:**
- Stock from excluded locations (e.g. Returns) is ignored. Configure this in **Settings → Order problems**.
- A problem resolves itself when the condition goes away, for example when stock arrives or the order ships.
- Each problem links to the customer's open Gorgias ticket, matched by email or by an order number mentioned in the ticket. That ticket gets a +20 urgency boost and shows the order and store.
- Shopify customer history (order count and lifetime spend) flows into the VIP and repeat-customer scoring.
- **Mark handled** records who handled the problem and when. **Notify customer** is covered below.

## Notify customer

Every customer message needs an explicit click from an agent. Nothing is ever sent by a background job.

1. On **Order problems**, click **Notify customer**.
2. Pick a template (EN or ES). Order data is filled in automatically, e.g. `{{customer_first_name}}`, `{{order_number}}`, `{{items}}`, `{{refund_status}}`. Edit the text freely.
3. Replace every `[[fill-in]]`, such as `[[restock date]]`. **Send** stays disabled until you do.
4. Choose how to send:
   - **Reply on the customer's open email ticket** (the default when one exists), or
   - **Create a new Gorgias email ticket**, tagged `proactive`.
5. Confirm. The problem is marked *Notified*, the message is stored with who sent it and when, and the activity log records it.

Messaging the same customer about the same problem again requires an extra checkbox.

**Bulk notify:** click a SKU in "SKUs short on stock", then **Bulk notify everyone affected**. You edit one template, and each customer gets a personalised copy. You can untick customers, check the preview, and see the result per order.

**Templates:** edit them in **Settings → Message templates**. There are built-in EN and ES templates for cancelled, out of stock (wait / swap / refund), oversold and delayed. You can add your own. Built-in templates can be reset to their original text.

Required for real sends:

| Variable | What |
| --- | --- |
| `GORGIAS_SUPPORT_EMAIL` | The address customers receive mail from. It must be an email integration in Gorgias. |
| `GORGIAS_SUPPORT_NAME` | The sender name (default: "Reason Clothing"). |

Demo orders (`npm run seed:demo`) are never sent. They are recorded as *simulated*.

## A2000 (ERP) stock

A2000 is the source of truth for physical warehouse stock. When it's configured, problem detection uses **the lower of Shopify on-hand and A2000 on-hand**, and the problem card says when the shortage comes from A2000.

**How it reads A2000.** It uses read-only Oracle queries through `node-oracledb` in thin mode, so no Oracle client install is needed.

**How Shopify SKUs are matched to A2000 items.** Matching uses the `VX_WEB_SKUS` view, where `SKU` is style + color and `SKU_Z` is style + color + size. Three Shopify formats are matched:
- style + color + `-` + size (e.g. `ABC-123001-S`)
- `SKU_Z` as-is (e.g. `ABC-123001OS`)
- style + color for one-size items

**Stock source.** Stock is `ON_HAND` for that size slot in `VR_INVENT_WH_Z`, summed over `A2000_WAREHOUSES` (default `01`).

**Setup:**
1. Ask your A2000 admin for a **read-only** database user that can `SELECT` from `VX_WEB_SKUS` and `VR_INVENT_WH_Z`.
2. Set `A2000_DB_USER`, `A2000_DB_PASSWORD`, and either `A2000_DB_CONNECT_STRING` (`host:1521/service`) or `A2000_DB_HOST` / `PORT` / `SERVICE`. Set `A2000_DB_SCHEMA` too.
3. Test it: `npm run a2000 -- <shopify sku> <shopify sku>`. It prints the on-hand stock for each SKU.

The server running this app must be able to reach the A2000 database. If A2000 runs on-premise, that may need a VPN or firewall rule.

## Urgency scoring

Every open ticket gets a score from 0 to 100. Scores are recalculated whenever a ticket syncs, and every 5 minutes because waiting time keeps growing. The logic is in `lib/scoring/engine.ts` and is covered by unit tests. All weights and keyword lists can be changed on **Settings** (admins only).

| Signal | Default |
| --- | --- |
| Unanswered customer messages | +8 for each message after the first, max 25 |
| Waiting since first unanswered message | +1 per hour, max 25 |
| Threat keywords (EN + ES, whole words, case and accents ignored) | legal 35, chargeback 30, fraud 20, public/review 15, escalation 10; max 50 combined |
| Angry tone | ALL CAPS 8, `!!!` 5, insults 10; max 15 |
| Claude AI urgency (optional) | +5 per level (0–3), plus any threats it finds and a one-line reason |
| VIP (ticket tag `vip`, or Shopify lifetime spend ≥ $500) / repeat customer (≥ 3 orders) | +10 / +5 |
| Order value (linked Shopify order) | ≥ $150 +5, ≥ $300 +10 |
| Linked order problem (not yet handled) | +20 |
| Agent replied last | score × 0.5 |

Auto-replies from Gorgias rules and internal notes don't count as an agent reply.

**Slack alerts** are sent once per ticket when the score reaches 70, or right away when a legal or chargeback threat appears. They re-arm after an agent replies. At most 10 alerts go out per run, and the rest are summarised, so the first sync doesn't flood the channel.

**Dashboard actions** (each one is written to the activity log):
- **Mark urgent:** adds the tag `urgent` and sets priority to `high` in Gorgias.
- **Assign to me:** needs your login email to match a Gorgias agent.
- **Note:** adds an internal note in Gorgias. Customers never see it.

## Deployment notes

Run two processes from the same code and `.env`: `npm run build && npm start` (web) and `npm run worker`.
Run `npm run db:deploy` on each release to apply migrations. The web app must be reachable over HTTPS so webhooks can arrive.
