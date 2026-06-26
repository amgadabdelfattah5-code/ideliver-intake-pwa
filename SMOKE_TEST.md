# OPS-INTAKE-01 Slice — End-to-End Smoke Test

## Slice Definition of Done
A reviewer can, on the deployed slice:
1. Log in (simple staff login — MFA deferred).
2. On phone: pick a merchant (live WP lookup), open a session, photograph ≥1 receipt, see "total orders: N", and **send**.
3. The photo is extracted by **Hermes + the chosen model provider** (single pass + deterministic validate) and the fields land in Postgres.
4. On laptop: see the session in a queue grouped by merchant, open it, see photo + extracted fields, correct, **submit order** → a LiquidShip shipment is created → auto-advance to the next photo.

End-to-end works for one merchant, online, single reviewer, single pass. That proves the whole architecture before any hardening.

## Smoke Test Procedure
1. Deploy the PWA to EasyPanel (blocked: MCP domain/TLS issues)
2. Run Prisma migration on the Postgres service
3. Update `.env` with real Postgres connection string
4. Login via `/api/auth/login` (use WP app password)
5. Load `/capture`, enter merchant ID (e.g., `795024`), click "Start Session"
6. Capture photos (minimum 1 for slice)
7. Click "Send for Extraction" → status becomes `awaiting_extraction`
8. Call `POST /api/test/extract-stub?sessionId=<id>` (stub Hermes; real Hermes is separate container)
9. Load `/review`, see the session in queue, click to open
10. Review order, click "Submit" → creates LiquidShip shipment
11. Verify shipment appears in WP (check WooCommerce orders)

## Current Blockers
- **EasyPanel MCP**: `create_domain` validation fails; need to configure subdomain + TLS manually or via SSH
- **Prisma Migration**: Cannot run locally (no Postgres on localhost:5432); must run migration on EasyPanel Postgres after connection is configured
- **Hermes Container**: Not deployed (stub exists for slice testing; real Hermes is Step 5 hardening)

## What's Ready
✅ All API routes (`/api/auth/*`, `/api/merchants`, `/api/sessions`, `/api/review/*`, `/api/orders/*/submit`)
✅ Capture UI (`/capture`) + Review UI (`/review`)
✅ Prisma schema with idempotency constraint
✅ Stub extraction endpoint for testing
✅ WP integration (merchants list, shipment creation)

## Next Steps to Complete Smoke
1. Configure EasyPanel compose service with:
   - Build command: `npm run build` + `npm start`
   - Environment variables (DATABASE_URL, WP credentials, etc.)
   - Volume mount for photos (TODO)
2. Get Postgres connection string from EasyPanel and update `.env`
3. Run `npx prisma migrate dev` on the database
4. Configure subdomain + TLS (manually via EasyPanel UI if MCP fails)
5. Run through smoke test procedure

## Slice Acceptance
- All steps 0-6 implemented
- App builds clean
- API surface complete
- Stub extraction allows testing review flow without Hermes
- Real Hermes integration is deferred to post-slice hardening
