# ATLAS Claude — Deployment Guide

## Directory layout on your server

```
~/atlas/
├── docker-compose.yml
├── .env
├── atlas-claude-backend/
│   ├── app/
│   ├── alembic/
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── alembic.ini
│   └── .env          ← (optional, values in root .env take priority)
└── atlas-claude-ui/
    ├── src/
    ├── Dockerfile
    ├── nginx.conf
    └── package.json
```

---

## Step 1 — Clone / copy files to your server

```bash
# On your Ubuntu server
mkdir -p ~/atlas
cd ~/atlas

# Copy the project files (scp, rsync, or git clone)
# scp -r atlas-claude-backend atlas-claude-ui docker-compose.yml .env you@server:~/atlas/
```

---

## Step 2 — Generate a secure API key

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Copy the output. You'll use it in both `.env` and the Chrome extension settings.

---

## Step 3 — Configure `.env`

```bash
cd ~/atlas
nano .env
```

Fill in:
```env
POSTGRES_USER=atlas
POSTGRES_PASSWORD=<strong password>
POSTGRES_DB=atlas
ATLAS_API_KEY=<key from step 2>
```

**If Postgres is already running in your ATLAS stack:**
- Remove the `postgres` service block from `docker-compose.yml`
- Make sure `atlas-network` is added to your existing Postgres service
- Update `DATABASE_URL` to point at your existing container name

---

## Step 4 — Build and start

```bash
cd ~/atlas

# First deploy: run migrations then start everything
docker compose up -d --build

# Watch logs to confirm startup
docker compose logs -f atlas-claude-backend
```

Expected output:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

## Step 5 — Verify the API

```bash
# From the server itself
curl http://localhost:8420/api/v1/health \
  -H "Authorization: Bearer <your-api-key>"

# Expected:
# {"status":"ok","db":"ok","accounts":0}
```

---

## Step 6 — Cloudflare Tunnel setup

If you're already using Cloudflare Tunnel for your other ATLAS services, add ATLAS Claude to your tunnel config.

### Option A — Two subdomains (cleanest)

```yaml
# In your cloudflared config.yml
ingress:
  - hostname: claude.yourdomain.com          # React dashboard
    service: http://localhost:8421
  - hostname: claude-api.yourdomain.com      # FastAPI backend
    service: http://localhost:8420
  # ... your existing routes ...
  - service: http_status:404
```

Then in the extension Options page, set:
- **Server URL**: `https://claude-api.yourdomain.com`

### Option B — Single subdomain (nginx handles routing)

```yaml
ingress:
  - hostname: claude.yourdomain.com
    service: http://localhost:8421    # nginx proxies /api/ internally to the backend
```

The included `nginx.conf` already handles this — `/api/` is proxied to `atlas-claude-backend:8000`.

In the extension Options page, set:
- **Server URL**: `https://claude.yourdomain.com`

---

## Step 7 — Install and configure the Chrome extension

1. In Chrome → `chrome://extensions` → enable **Developer mode**
2. Click **Load unpacked** → select the `claude-usage-tracker-multiaccount` folder
3. Click the extension icon → click **⚙ Settings**
4. Fill in:
   - **Server URL**: your Cloudflare Tunnel URL (e.g. `https://claude-api.yourdomain.com`)
   - **API Key**: the key from Step 2
5. Click **Test connection** — you should see ✓ Connected

---

## Step 8 — Open Claude and verify sync

1. Open [claude.ai](https://claude.ai) and send any message
2. Open your dashboard at `https://claude.yourdomain.com`
3. Your account should appear with live usage data

For each additional Claude account:
- Sign into that account in a different Chrome profile (or Firefox container)
- Make sure the extension is installed there too
- Send a message — it syncs automatically

---

## Useful commands

```bash
# View live backend logs
docker compose logs -f atlas-claude-backend

# Restart only the backend
docker compose restart atlas-claude-backend

# Run Alembic migrations manually (after pulling new code)
docker compose run --rm atlas-claude-migrate

# Open a psql shell into Postgres
docker compose exec postgres psql -U atlas -d atlas

# Check how many accounts are tracked
docker compose exec postgres psql -U atlas -d atlas \
  -c "SELECT email, nickname, last_seen_at FROM accounts ORDER BY last_seen_at DESC;"

# Stop everything
docker compose down

# Stop + wipe database (careful!)
docker compose down -v
```

---

## Updating

```bash
cd ~/atlas
git pull            # or copy new files
docker compose up -d --build

# Migrations run automatically via the atlas-claude-migrate service
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Extension shows "not_configured" | Set Server URL + API Key in extension Options → ⚙ |
| Test connection fails | Check Cloudflare Tunnel is running: `cloudflared tunnel status` |
| `401 Unauthorized` from API | API key mismatch — must match exactly in `.env` and extension settings |
| Dashboard shows 0 accounts | Open claude.ai and send a message first; sync fires on each message |
| Postgres connection refused | Check `POSTGRES_USER/PASSWORD/DB` match across `.env` and DB init |
| Port 8420/8421 already in use | Change host ports in `docker-compose.yml` (container ports stay 8000/80) |

---

## Architecture reminder

```
Claude.ai (browser tab)
      │
      ▼
Chrome Extension (intercepts requests)
      │  POST /api/v1/sync  every message
      ▼
FastAPI :8420  ──────────────────────────────────────────┐
      │                                                   │
      ▼                                                   │
PostgreSQL                                                │
      │                                                   │
      ▼                                                   │
React Dashboard :8421  ◄── GET /api/v1/dashboard (60s) ──┘
      │
      ▼
Cloudflare Tunnel → public HTTPS
```
