# Deploying UsageOS

This guide covers running UsageOS on a server you control and reaching it over HTTPS. For a quick local try-out, the Quick start in [README.md](README.md) is enough.

## 1. Server basics

Any Linux machine with Docker and Docker Compose v2 works (a small VPS, a home server, a Raspberry Pi 4+). UsageOS is light: Postgres, a small API and a static site.

```bash
git clone https://github.com/YRB19/UsageOS.git
cd UsageOS
cp .env.example .env
nano .env                      # POSTGRES_PASSWORD, SERVER_API_KEY, DASHBOARD_PASSWORD
docker compose up -d --build
curl -s http://localhost:3000/api/v1/health
```

By default the dashboard listens on port `3000` (change with `USAGEOS_PORT`). The API (`8000`) and Postgres (`5432`) only listen on `127.0.0.1`, so they are not reachable from outside the machine.

## 2. HTTPS and a domain

Browsers will only let the extension talk to your server over HTTPS (except for `localhost`), and Telegram requires it. Pick one:

### Caddy on the same machine

```
usageos.example.com {
    reverse_proxy localhost:3000
}
```

Caddy gets and renews the certificate automatically. Point your domain's DNS at the server and open ports 80 and 443.

### Caddy (or another proxy) running in Docker

If your proxy lives in its own Docker network, attach only the dashboard container to it:

```bash
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d --build
```

Edit the network name in `docker-compose.proxy.yml` to match yours, then proxy to `usageos-frontend:80`.

### Cloudflare Tunnel (no open ports)

Point a public hostname at `http://localhost:3000` in your tunnel config. If you run `cloudflared` as a systemd service, check which config file it actually reads (usually `/etc/cloudflared/config.yml`, not the one in your home directory) before editing.

## 3. Connect the extension

Use your public address as the **Server URL** (`https://usageos.example.com`, no trailing slash) and the `SERVER_API_KEY` from `.env` as the **API Key**. See README.md for the full steps.

## 4. Telegram alerts (optional)

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in `.env`, run `docker compose up -d --build backend`, then register the webhook with the same secret:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://usageos.example.com/api/v1/telegram/webhook" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

## 5. Updating

```bash
git pull
docker compose up -d --build
```

Database changes are applied automatically at startup. `docker compose restart` does not pick up new code.

## 6. Backups

All data lives in the `postgres_data` Docker volume (avatars are in `usageos_uploads`). A simple nightly dump:

```bash
docker compose exec -T postgres pg_dump -U server server | gzip > usageos-$(date +%F).sql.gz
```

Restore into an empty database with `gunzip -c file.sql.gz | docker compose exec -T postgres psql -U server server`.

## 7. Rotating secrets

| Secret | How to rotate |
|---|---|
| `DASHBOARD_PASSWORD` | Change it in `.env`, then `docker compose up -d`. Everyone is signed out and must log in again. |
| `SERVER_API_KEY` | `openssl rand -hex 32`, update `.env`, run `docker compose up -d`, then paste the new key into the extension's Options page. |
| `TELEGRAM_BOT_TOKEN` | Send `/revoke` to @BotFather, put the new token in `.env`, restart the backend, and run `setWebhook` again. |
| `POSTGRES_PASSWORD` | Changing `.env` alone does not change the database user. Run `ALTER USER server PASSWORD '<new>'` inside Postgres first, then update `.env` and restart. |

## 8. Troubleshooting

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

502 errors from your proxy usually mean it cannot reach the `usageos-frontend` container: check that they share a Docker network (see the proxy override above).
