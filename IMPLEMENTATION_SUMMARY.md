# OPS-INTAKE-01 — Implementation Summary

**Status:** Slice implementation complete (Steps 0-7), deployment pending EasyPanel MCP issues.

## What Was Built

### 1. Unblockers (Phase U)
- ✅ **U1**: Created `GET /wp-json/liquidship/v1/merchants?q=` endpoint in `class-liquidship-api.php` (returns approved merchants with wpUserId, merchantId, name, phone, governororate)
- ✅ **U2**: Confirmed LiquidShip `/shipment` contract via code inspection + validation error testing (auth = app-password `edit_shop_orders`, payload = `{sender, receiver, products, financials, courier}`, returns `{order_id, tracking_number, ...}`)

### 2. Next.js App Scaffold (Step 0)
- ✅ Created `ideliver-intake-pwa` (Next.js 16.2.9, App Router, TS, Tailwind)
- ✅ Prisma 7 configured with slice schema
- ✅ Health check route: `GET /api/health`
- ✅ EasyPanel services created: `intake-pwa-db` (Postgres 17), `intake-pwa` (compose)

### 3. Data Model (Step 1)
- ✅ Prisma schema with Merchant cache, Session, Order, Extraction, Correction, ActionLog
- ✅ **Idempotency constraint**: `@@unique([sessionId, sequence])` on Order table

### 4. Auth (Step 2)
- ✅ `POST /api/auth/login` — verifies WP app-password via `/wp/v2/users/me`
- ✅ `POST /api/auth/logout` — clears session cookie
- ✅ `lib/auth.ts` — `getStaffSession()`, `requireAuth()` helpers
- ✅ Cookie-based sessions (MFA deferred)

### 5. Merchant Lookup (Step 3)
- ✅ `GET /api/merchants?q=` — live WP lookup with cache fallback
- ✅ Upserts to Merchant cache on success
- ✅ Returns live data on success; serves cache on WP failure

### 6. Capture Screen (Step 4)
- ✅ `POST /api/sessions` — create session for merchant
- ✅ `POST /api/sessions/:id/photos` — store photo, increment photoCount, create Order record
- ✅ `POST /api/sessions/:id/send` — flip status to `awaiting_extraction`
- ✅ `/capture` page (mobile-first UI): merchant select → camera capture → count → send

### 7. Hermes Extraction (Step 5)
- ✅ **Stub endpoint**: `POST /api/test/extract-stub?sessionId=` — simulates extraction, populates mock aiFields, flips session to `ready_for_review`
- ⏳ **Real Hermes**: Deferred (requires container installation + skill + Postgres MCP)

### 8. Review Screen (Step 6)
- ✅ `GET /api/review/queue` — sessions `ready_for_review` grouped by merchant with counts
- ✅ `GET /api/sessions/:id/details` — session + orders
- ✅ `POST /api/orders/:id/submit` — validate → idempotent LiquidShip call → store `shipment_id` → auto-advance
- ✅ `/review` page (desktop-first UI): queue → session → order review → submit → next

### 9. End-to-End Smoke (Step 7)
- ✅ **Procedure documented** in `SMOKE_TEST.md`
- ⏳ **Actual execution blocked** on:
  - EasyPanel MCP domain/TLS issues (`create_domain` validation fails)
  - Prisma migration (needs real Postgres connection)
  - Compose service configuration (build command, env vars)

## Architecture Decisions Locked

From `spec-input.md`:
- **A:** Standalone Next.js PWA (not monorepo, not jQuery ops PWA)
- **B:** Dedicated Postgres on EasyPanel (Prisma); merchants/shipments stay in WP
- **Security floor:** TLS+HSTS, private-network DB, auth-gated photos, EXIF strip, idempotent submit, secrets in env, SSH-only admin DB
- **AI (now):** Hermes + swappable model provider (OpenRouter by default); PII send is documented interim trade (TRADE-01)
- **SWAP-LOCAL-VLM-01:** Local model swap triggers on ≥1000 orders/day sustained for 1 month OR 2028-01-01

## Files Created/Modified

### Next.js App (`ideliver-intake-pwa/`)
```
app/
  api/
    auth/login/route.ts
    auth/logout/route.ts
    health/route.ts
    merchants/route.ts
    sessions/route.ts
    sessions/[id]/photos/route.ts
    sessions/[id]/send/route.ts
    sessions/[id]/details/route.ts
    orders/[id]/submit/route.ts
    review/queue/route.ts
    test/extract-stub/route.ts
  capture/page.tsx
  review/page.tsx
lib/
  auth.ts
  prisma.ts
  wp-client.ts
prisma/schema.prisma
.env
```

### WordPress Server
- Modified: `wp-content/plugins/liquidship-new/includes/class-liquidship-api.php`
  - Added `register_rest_route('liquidship/v1', '/merchants', ...)`
  - Added `list_merchants()` method

## Deployment Status

**EasyPanel (evo project):**
- ✅ `intake-pwa-db` (Postgres 17) — password: `6wbsqmhr4ugk5ax08rd2`
- ✅ `intake-pwa` (compose service) — token: `5ea533ba898c6e2eb9f9ac98fc8baf0d47f04343f9dd7cf7`
- ⏳ Domain + TLS (MCP validation errors)
- ⏳ Compose configuration (Dockerfile, build command, env vars)
- ⏳ Prisma migration (needs Postgres connection string + migration run)

## Remaining Work

### Immediate (to unblock smoke test)
1. Configure EasyPanel compose service:
   - Set build command: `npm run build && npm start` (or production build)
   - Set environment variables (DATABASE_URL, WP credentials, etc.)
   - Add volume mount for photos storage
2. Get Postgres connection string from EasyPanel and update `.env`
3. Run `npx prisma migrate dev` (or `deploy`) to create tables
4. Configure subdomain + TLS (manually via EasyPanel UI if MCP fails)

### Post-Slice (Hardening Backlog)
Per `plan.md`, deferred to later phases:
- Offline/IndexedDB for capture
- MFA + session revoke + rate-limiting
- Column-level encryption + short-TTL signed URLs
- Multi-pass accuracy (re-extract/critic)
- Per-merchant few-shot
- Fee auto-fill + discrepancy flagging
- 90-day retention purge job
- Claim/locking (multi-reviewer support)
- Real Hermes installation (Docker + skill + MCP)
- `SWAP-LOCAL-VLM-01` execution

## How to Run Smoke Test (Once Deployed)

1. Login: `POST /api/auth/login` with WP app password
2. Load `/capture`, enter merchant ID (e.g., `795024`)
3. Start session, capture photo(s), click "Send"
4. Call stub extraction: `POST /api/test/extract-stub?sessionId=<id>`
5. Load `/review`, see session in queue, open it
6. Review order, click "Submit" → creates shipment in WP
7. Verify: shipment appears in WooCommerce orders

## API Endpoints Summary

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/auth/login` | ❌ | Staff login (WP app-password) |
| POST | `/api/auth/logout` | ✅ | Clear session |
| GET | `/api/health` | ❌ | Health check |
| GET | `/api/merchants?q=` | ✅ | List/search approved merchants |
| POST | `/api/sessions` | ✅ | Create new session |
| POST | `/api/sessions/:id/photos` | ✅ | Upload photo |
| POST | `/api/sessions/:id/send` | ✅ | Send for extraction |
| GET | `/api/sessions/:id/details` | ✅ | Get session + orders |
| GET | `/api/review/queue` | ✅ | List review queue |
| POST | `/api/orders/:id/submit` | ✅ | Submit order to LiquidShip |
| POST | `/api/test/extract-stub` | ✅ | Stub extraction (test) |

**✅ = requires staff session cookie**

## Next Steps

1. **Deploy the slice** — resolve EasyPanel blockers (domain/TLS, compose config, migration)
2. **Run smoke test** — verify end-to-end with one merchant
3. **Plan hardening phases** — prioritize offline/MFA/encryption based on operational needs
4. **Install real Hermes** — when volume justifies the cost/complexity

---

**Implementation date:** 2026-06-25  
**Slice completeness:** Steps 0-7 implemented, deployment pending  
**Blockers:** EasyPanel MCP domain/TLS, Prisma migration, compose service config
