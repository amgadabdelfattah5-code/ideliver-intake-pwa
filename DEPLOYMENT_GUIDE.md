# EasyPanel Deployment Guide for iDeliver Intake PWA

## Current Status
- ✅ docker-compose-complete.yml created with embedded configuration
- ✅ Postgres service created in EasyPanel (intake-pwa-db)
- ✅ Compose service created in EasyPanel (intake-pwa)
- ❌ EasyPanel MCP API having validation errors
- ❌ Docker CLI not available in SSH environment

## Manual Deployment Steps

### Option 1: Import via EasyPanel Web UI (RECOMMENDED)

1. **Access EasyPanel**
   - URL: http://187.124.50.115:3000
   - Login with your EasyPanel credentials

2. **Delete Existing Services** (if needed)
   - Navigate to Project: `ideliver-intake-pwa`
   - Delete `intake-pwa` compose service (if it exists and is broken)
   - Keep `intake-pwa-db` Postgres service (already configured)

3. **Import Compose File**
   - Click "Create Service" → "Compose"
   - Service Name: `intake-pwa`
   - Project: `ideliver-intake-pwa`
   - **Important**: Copy the content from `docker-compose-complete.yml` and paste it
   - Click "Create"

4. **Configure Environment** (if not already in compose file)
   ```
   DATABASE_URL=postgresql://postgres:ideliver_intake_pwa_secure_2025@intake-pwa-db:5432/ideliver_intake_pwa
   SESSION_SECRET=ideliver_intake_pwa_session_secret_2025
   WP_APP_USER=amged.mohammed@gmail.com
   WP_APP_PASSWORD=JzNe xI72 Fl4p 35Qq QbYw f33U
   WP_API_BASE=https://ideliveregypt.com/wp-json
   NODE_ENV=production
   PORT=3000
   ```

5. **Deploy**
   - Click "Deploy" on the compose service
   - Watch logs for any build errors

6. **Configure Domain**
   - Add domain: `intake.ideliveregypt.com` (or your preferred subdomain)
   - Enable HTTPS (Let's Encrypt)
   - Port: 3000

7. **Run Prisma Migrations**
   - Access container terminal via EasyPanel
   - Run: `npx prisma migrate deploy`
   - Verify tables created

### Option 2: Manual Docker Deployment (if CLI becomes available)

If Docker becomes accessible via SSH:

```bash
# Upload and deploy
scp docker-compose-complete.yml u404815879@213.130.145.166:/tmp/
ssh u404815879@213.130.145.166
cd /tmp
docker-compose -f docker-compose-complete.yml up -d
```

## Troubleshooting

### "invalid character 'p' looking for beginning of value" Error
This error suggests:
1. File encoding issue (should be UTF-8, LF line endings)
2. YAML syntax error
3. EasyPanel parser expecting different format

Our `docker-compose-complete.yml` uses:
- ✅ UTF-8 encoding
- ✅ LF line endings
- ✅ Valid YAML syntax
- ✅ All environment variables embedded

### Service Won't Start
Check logs in EasyPanel for:
- Port conflicts (3000 already in use)
- Database connection issues
- Missing dependencies during `npm install`

### Database Connection
Ensure `intake-pwa-db` service is running:
- Container name: `intake-pwa-db`
- Network: `intake-network`
- User: `postgres`
- Password: `ideliver_intake_pwa_secure_2025`
- Database: `ideliver_intake_pwa`

## Next Steps After Deployment

1. **Verify Deployment**
   ```bash
   curl http://intake.ideliveregypt.com:3000/api/health
   ```

2. **Run Database Migrations**
   ```bash
   docker exec -it intake-pwa npx prisma migrate deploy
   ```

3. **Test Endpoints**
   - POST /api/auth/login
   - GET /api/merchants
   - POST /api/photos/upload
   - POST /api/shipments/send

4. **Configure TLS**
   - Enable HTTPS in EasyPanel domain settings
   - Verify HSTS enabled

## File Locations

- Local: `ideliver-intake-pwa/docker-compose-complete.yml`
- Server: `/tmp/docker-compose-complete.yml` (uploaded via SSH)
- EasyPanel: Import through web UI

## Notes

- The compose file includes both the PWA and PostgreSQL services
- Environment variables are embedded for simplicity
- Network isolation configured (`intake-network`)
- Persistent volumes for database and uploads
- Restart policy: `unless-stopped`
