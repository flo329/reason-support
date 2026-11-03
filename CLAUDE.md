# Reason Support – notes for Claude sessions

Internal support platform for Reason Clothing (Gorgias + Shopify + A2000). See README.md for the full picture.

## Status
- Phase 1 done: auth, Gorgias client/sync/webhooks, ticket cache.
- Phase 2 done: urgency scoring (`lib/scoring/`), Urgent Tickets page + actions, Slack alerts, scoring settings.
- Phase 3 done (built against demo data; real-store test pending): Shopify client/sync/webhooks (`lib/shopify/`), problem detection (`lib/problems/`), Order Problems page.
- Next: verify Phase 3 against the real stores (`npm run shopify -- check` / `sync`), then Phase 4 (notify-customer templates via Gorgias), Phase 5 (A2000 adapter, polish).
- The user approves each phase before the next one starts. Stop after each phase with run/test instructions.

## Rules from the user
- Never send anything to customers automatically; every customer message needs an agent click.
- Secrets only via env vars / .env (never hardcode, never ask for tokens in chat).
- Shopify store config is a list (multiple stores). Store tokens are provided as environment variables
  in the cloud environment; ask the user for the variable NAMES if they don't match `SHOPIFY_STORES` + `SHOPIFY_<NAME>_DOMAIN/_TOKEN`.

## Local dev in a cloud session
```bash
service postgresql start
su postgres -c "psql -c \"CREATE USER reason WITH PASSWORD 'reason' CREATEDB;\" -c \"CREATE DATABASE reason_support OWNER reason;\""
cp .env.example .env   # set DATABASE_URL=postgresql://reason:reason@localhost:5432/reason_support and AUTH_SECRET
npm install && npx prisma migrate dev
npm run user:create -- flo@reasonclothing.com "<password>" "Flo" --admin
npm run seed:demo      # optional demo tickets
npm test && npm run typecheck
```
Postgres stops when the session's worker restarts; run `service postgresql start` again.
