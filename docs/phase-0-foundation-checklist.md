# Phase 0 Foundation Checklist

Date: 2026-06-27

This checklist is the gate before capture UI, AI extraction, or shipment automation work continues.

## Local Code Gate

Already verified locally:

- `npm.cmd run prisma:generate`
- `npm.cmd run lint`
- `npm.cmd run build`

Notes:

- Use `npm.cmd` on Windows if PowerShell blocks `npm.ps1`.
- The app no longer depends on Google Fonts during build.

## EasyPanel Service Settings

Service: `intake-pwa`

Required Nixpacks setting:

```text
Working Directory: /app
```

Required app environment variables:

```env
DATABASE_URL=postgresql://postgres:postgres123@intake-db:5432/intake?schema=public
SESSION_SECRET=CHANGE_TO_LONG_RANDOM_SECRET
WP_APP_USER=amged.mohammed@gmail.com
WP_APP_PASSWORD=CHANGE_TO_WORDPRESS_APP_PASSWORD
WP_API_BASE=https://ideliveregypt.com/wp-json
MODEL_PROVIDER_DEFAULT=openrouter
MODEL_PROVIDER_API_KEY=
```

Recommended commands after deployment:

```bash
npm run migrate:deploy
npm run migrate:status
```

## Health Gate

The deployed health endpoint must return:

```json
{
  "status": "ok",
  "db": "connected"
}
```

If it returns `db: unavailable`, do not continue to UI or AI work. Fix networking, `DATABASE_URL`, or migrations first.

## Foundation Done Means

- EasyPanel build succeeds.
- Prisma migration has run against the EasyPanel Postgres service.
- `/api/health` returns app and DB green.
- Login route can create a signed session cookie.
- Protected routes reject logged-out requests.

Only after this gate is green should Phase 1 contract verification begin.
