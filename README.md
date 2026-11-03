# Reason Support

Internal platform for the Reason Clothing support team. It sits on top of Gorgias, Shopify and A2000 and adds:
urgent-ticket detection, proactive order-problem alerts, and an activity log.

**Status: Phase 1:** project setup, login, Gorgias connection, ticket sync, webhooks, basic ticket queue.

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

No Gorgias key yet? Run `npm run seed:demo` to load 6 fake tickets. Remove them with `npm run demo:clear` before going live.

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

## Deployment notes

Run two processes from the same code and `.env`: `npm run build && npm start` (web) and `npm run worker`.
Run `npm run db:deploy` on each release to apply migrations. The web app must be reachable over HTTPS so webhooks can arrive.
