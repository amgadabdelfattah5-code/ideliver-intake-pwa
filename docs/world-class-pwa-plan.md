# iDeliver Intake PWA - Final Product Plan

Date: 2026-06-26
Spec: OPS-INTAKE-01

## Product Purpose

This PWA replaces the current manual Telegram/n8n/Google-Sheet intake loop with a purpose-built, AI-assisted order-entry workflow.

The business rule is simple: each receipt photo captured at pickup becomes one shipment after AI extraction and human review. The session is the unit of accountability: one merchant, one pickup event, many receipt photos.

## Current Reality

The current implementation is a scaffold, not the final PWA:

- Next.js app exists.
- Prisma schema mostly matches the slice plan.
- Basic auth, merchant lookup, session, photo, send, queue, and submit APIs exist.
- Review UI exists in rough form.
- Main app is still the default Next.js starter screen.
- Capture UI does not exist yet.
- AI/Hermes is stubbed.
- Photo storage is temporary base64 data URLs.
- Prisma migrations do not exist yet.
- LiquidShip payload and merchant endpoint still need live contract verification.

This means deployment can prove infrastructure, but it cannot yet prove the product.

## Enhancements To The Original Plan

### 1. Add Quality Gates

Each phase must have a demoable gate before the next phase starts.

- Foundation gate: deployed app boots, DB connects, migrations run, auth works.
- Capture gate: phone can create a real merchant session with uploaded receipt photos.
- AI/review gate: orders receive structured fields and can be corrected in a real data-entry UI.
- Shipment gate: one reviewed order creates exactly one LiquidShip shipment.
- Product gate: a full session can be resumed, completed, audited, and inspected.

### 2. Replace Temporary Photo Storage Before Real Testing

Base64 data URLs are acceptable only for early scaffolding. Before serious end-to-end testing, photos must be stored as files on a mounted volume or object storage and served through an authenticated route.

### 3. Verify External Contracts Before UI Polish

Two contracts are high-risk and must be confirmed early:

- Approved merchant search/read endpoint from WordPress.
- LiquidShip shipment creation payload, auth, response shape, and idempotency behavior.

No polished review UI should be considered complete until these contracts are proven live.

### 4. Use A Local Stub AI Before Hermes

Before connecting Hermes, add a deterministic/stub extraction path that writes sample `aiFields`, `confidence`, and validation flags. This allows the capture and review loop to be built and tested without blocking on the AI container.

Hermes comes after the app proves that it can move orders through the workflow.

### 5. Treat Human Corrections As First-Class Data

The review UI must save corrections field-by-field, not just overwrite a JSON object. This is the future evaluation and training dataset.

### 6. Upgrade Minimal Auth Enough For Internal Use

The slice can defer MFA, but the current JSON cookie should be replaced before exposing the app:

- Signed session token or encrypted session cookie.
- Server-side session validation.
- Basic login rate limiting.
- Clear logout/session expiry.

### 7. Build For The Two Real Devices

The capture flow is phone-first. The review flow is laptop-first. They should not share the same layout.

- Phone: large tap targets, camera-first, count/quality review, send.
- Laptop: dense fields, large photo viewer, keyboard flow, confidence/validation flags.

## Final Execution Plan

### Phase 0 - Foundation Lock

Goal: make the deployed app technically trustworthy.

Tasks:

- Create proper Prisma migrations.
- Make `/api/health` check database connectivity.
- Fix deployment working directory and env vars.
- Run migration on EasyPanel Postgres.
- Confirm app boots on its subdomain.
- Replace plain JSON session cookie with signed/encrypted session handling.

Done when:

- `/api/health` returns app and DB green on EasyPanel.
- Login works.
- Protected API rejects logged-out requests.
- Database tables exist from migrations, not ad hoc pushes.

### Phase 1 - Contract Verification

Goal: remove unknowns before building on them.

Tasks:

- Confirm or add WordPress approved-merchant endpoint.
- Document returned merchant fields.
- Confirm LiquidShip shipment payload using a safe test merchant/order.
- Document response fields, especially shipment/order ID and tracking number.
- Decide idempotency behavior for LiquidShip submit.

Done when:

- Merchant search returns real approved merchants.
- One controlled shipment can be created via API.
- The field map is documented in this repo.

### Phase 2 - Phone Capture Slice

Goal: make the pickup employee flow real.

Tasks:

- Replace starter homepage with app shell.
- Add login screen.
- Add mobile merchant search/select.
- Add session create flow.
- Add camera/photo upload.
- Store photos on volume or object storage, not base64.
- Add photo count, preview, delete/retake, and send.
- On send, use local stub extraction to mark orders extracted/ready for review.

Done when:

- A phone can create a merchant session with N photos.
- Session locks on send.
- Queue receives N extracted orders.

### Phase 3 - Laptop Review Slice

Goal: make the data-entry employee flow fast and accurate.

Tasks:

- Build queue grouped by merchant/session.
- Build large photo viewer.
- Build structured field editor:
  - recipient name
  - phone
  - address
  - governorate
  - product
  - price
  - shipping fee as printed
  - COD
- Add deterministic validation flags.
- Save corrections field-by-field.
- Add keyboard-driven next/submit flow.
- Mark awaiting merchant reply when unreadable.

Done when:

- Reviewer can complete a session from first photo to last.
- Corrections and action logs are written.
- Resume opens the next unsubmitted order.

### Phase 4 - Shipment Creation

Goal: submit reviewed orders into LiquidShip safely.

Tasks:

- Map reviewed fields to the verified LiquidShip payload.
- Add local idempotency guard.
- Add remote idempotency if LiquidShip supports it.
- Store shipment ID/tracking number.
- Auto-advance after successful submit.
- Mark session completed when all orders are submitted.

Done when:

- Double-click/double-submit does not create duplicate shipments.
- One full session creates the correct number of shipments.

### Phase 5 - Real AI Integration

Goal: replace stub extraction with the real AI worker.

Tasks:

- Deploy Hermes or a simpler worker if Hermes proves operationally heavy.
- Add provider config through env.
- Strip EXIF before model calls.
- Send image-only payloads.
- Store raw provider output by reference, not inline PII logs.
- Write structured fields, confidence, validation flags.
- Keep provider backend swappable.

Done when:

- Sent session becomes ready for review without manual intervention.
- Low-confidence/missing fields are visibly flagged.
- Provider can be swapped by config.

### Phase 6 - World-Class Hardening

Goal: make it production-grade.

Tasks:

- Offline capture with IndexedDB and background sync.
- MFA.
- Rate limiting and lockout.
- Short-lived signed photo URLs.
- Column encryption for phone/address.
- PII-redacted logging.
- 90-day purge job for photos/raw extraction.
- Encrypted backups and restore test.
- Eval harness from correction data.
- Per-merchant few-shot examples.
- Fee lookup from authoritative LiquidShip logic.
- Multi-pass re-extract/critic for low-confidence cases.

Done when:

- The PWA can safely replace Telegram/n8n/Sheets as the sole intake path.

## Immediate Next Step

Proceed with Phase 0 only:

1. Create and commit the Prisma migration.
2. Make health check verify DB connectivity.
3. Fix EasyPanel working directory/env.
4. Run migration.
5. Confirm deployed health is green.

No AI, UX polish, or shipment automation should be expanded until this foundation is green.
