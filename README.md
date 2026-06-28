# iDeliver Intake PWA

Internal pickup intake and shipment review PWA for iDeliver Egypt.

This app implements the `OPS-INTAKE-01` workflow: pickup staff capture receipt photos by merchant session, AI extracts fields, and a reviewer corrects/submits shipments into LiquidShip.

See:

- `docs/world-class-pwa-plan.md`
- `docs/phase-0-foundation-checklist.md`

## Getting Started

Install dependencies and generate Prisma client:

```bash
npm install
npm run prisma:generate
```

Create `.env` from `.env.example`, then run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Useful Commands

```bash
npm run lint
npm run build
npm run migrate:deploy
npm run migrate:status
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

## Current Gate

Current work is Phase 0 foundation only:

- proper Prisma migrations
- DB-backed health check
- signed session cookies
- EasyPanel deployment and DB connectivity

Do not expand AI, UI polish, or shipment automation until `/api/health` is green on EasyPanel.

<!-- auto-deploy webhook test 2: 2026-06-28 16:30 -->
