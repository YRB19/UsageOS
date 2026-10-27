# UsageOS

**A self-hosted dashboard for tracking usage across multiple Claude.ai accounts.**

Claude's built-in usage indicator only shows the account you're currently logged into. If you juggle several accounts (personal, work, per-project), you end up logging in and out just to check how much you have left. UsageOS fixes that: a Chrome extension quietly records usage from every account you use, and a web dashboard shows all of them side by side, with reset countdowns, notes, history charts and Telegram alerts.

- **All accounts, one screen**: session and weekly usage bars, subscription tier, time until reset
- **Nicknames, colors and notes** per account, auto-saved
- **History charts** of usage over time
- **Telegram notifications** shortly before a limit resets, plus a bot you can message to add notes
- **Self-hosted**: your data lives in your own Postgres database, nothing goes to a third party

---

## How it works

```
Claude.ai (any account, in your browser)
        │
        ▼
Chrome extension ── intercepts claude.ai API responses, computes usage %
        │  POST /api/v1/sync   (after every message; queued offline if the server is down)
        ▼
FastAPI backend ──► PostgreSQL
        │
        ├──► React dashboard (nginx serves the UI and proxies /api/ to the backend)
        │
        └──► Telegram scheduler (checks every 60s) ──► Telegram Bot API
                      ▲
                      └── Telegram webhook ◄── you reply "note <nickname> <text>"
```

1. **Capture.** The extension watches claude.ai's own API responses (usage, limits, reset timestamps, subscription tier) and identifies which account they belong to.
2. **Sync.** After each message, the extension posts a snapshot to your backend at `/api/v1/sync`, authenticated with your API key. If the server is unreachable, snapshots are queued and sent later.
3. **Store.** The backend keeps the latest state per account plus a history of sync events for charts.
4. **View.** The React dashboard reads from the backend and renders one card per account.
5. **Notify.** A background loop in the backend checks every 60 seconds for any limit resetting within the next 10 minutes. If it finds one that hasn't been announced yet, it messages the Telegram chat linked to that account. Duplicate alerts are prevented by a unique constraint on the notification log.

## Components

| Component | Tech | Role |
|---|---|---|
| `extension/` | Chrome MV3, vanilla JS | Captures usage from claude.ai and syncs it to the backend; also has a local popup dashboard |
| `backend/` | FastAPI, SQLAlchemy, Alembic, PostgreSQL | Sync endpoint, accounts API, notes, Telegram webhook and scheduler |
| `frontend/` | React, Vite, TypeScript, Tailwind | Multi-account dashboard served by nginx |

The extension is a fork of [lugia19/Claude-Usage-Extension](https://github.com/lugia19/Claude-Usage-Extension) (GPL-3.0), modified to sync to a self-hosted backend.

---

## Quick start

### Prerequisites

- Docker and Docker Compose
- A server (or any always-on machine) to host it
- A domain with HTTPS if you want to reach it from other devices or use Telegram (Telegram webhooks require a public HTTPS URL). A reverse proxy such as Caddy or a Cloudflare Tunnel works well.
- Chrome, Brave or another Chromium browser

### 1. Clone and configure

```bash
git clone https://github.com/YRB19/UsageOS.git
cd UsageOS
cp .env.example .env
```

Edit `.env`:

| Variable | Description | Required |
|---|---|---|
| `POSTGRES_USER` | Database user | Yes |
| `POSTGRES_PASSWORD` | Database password, use something strong | Yes |
| `POSTGRES_DB` | Database name | Yes |
| `ATLAS_API_KEY` | Shared secret used by the extension and dashboard to authenticate to the backend | Yes |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather | Only for Telegram features |
| `CORS_ORIGINS` | Your dashboard URL, exactly as you open it in the browser | Yes |

Generate a good API key:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 2. Start the stack

```bash
docker compose up -d --build
```

This starts Postgres, the backend (port 8000 inside Docker) and the frontend (port 3000 on the host, nginx on 80 inside the container). Tables are created automatically on startup.

> **Note:** if your `docker-compose.yml` attaches services to an external `atlas-network` (used to share a network with a Caddy container), create it first with `docker network create atlas-network`, or remove that network from the compose file if you don't use a shared proxy.

Check it's healthy:

```bash
curl -s http://localhost:3000/api/v1/health
```

### 3. Put it behind HTTPS (recommended)

Point a reverse proxy at the frontend container. With Caddy:

```
usageos.yourdomain.com {
    reverse_proxy usageos-frontend:80
}
```

The frontend's nginx already forwards `/api/*` to the backend, so you only need one public hostname for both the dashboard and the API.

### 4. Install the extension

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.
3. Open the extension's **Options** page (extension icon, then the settings gear) and enter:
   - **Server URL**: `https://usageos.yourdomain.com` (no trailing slash)
   - **API Key**: the `ATLAS_API_KEY` from your `.env`
4. Click **Test Connection**.
5. Open claude.ai in each account you want to track and send a message. The account appears on your dashboard after the first sync.

After changing any extension code, click the reload icon on its card in `chrome://extensions`.

### 5. Optional: Telegram notifications

1. Message [@BotFather](https://t.me/BotFather), create a bot, and put the token in `.env` as `TELEGRAM_BOT_TOKEN`. Rebuild with `docker compose up -d --build backend`.
2. Register the webhook:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://usageos.yourdomain.com/api/v1/telegram/webhook"
   ```
   You should get `{"ok":true,...}`.
3. Send any message to your bot to start a chat, then find your chat ID (for example via [@userinfobot](https://t.me/userinfobot)).
4. On the dashboard, click the small **checkmark icon** next to an account's name, paste the chat ID and **Save**. Chat IDs are stored per account, so different accounts can notify different chats.

**Bot commands**

| Command | What it does |
|---|---|
| `note <nickname> <text>` | Saves a note on the account with that nickname |

---

## Using the dashboard

- Each card shows the account's identity, usage bars, tier and reset countdown.
- Click the nickname to rename an account and use the color picker to tell accounts apart.
- Type in the notes box; it auto-saves after a short pause.
- Expand a card to see its usage history chart.

---

## API reference

Base path: `/api/v1`. All endpoints except `/health` require `Authorization: Bearer <ATLAS_API_KEY>`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check (no auth) |
| `POST` | `/sync` | Extension posts a usage snapshot |
| `GET` | `/accounts` | List accounts with latest usage and notes |
| `GET` | `/accounts/{id}` | Single account |
| `PATCH` | `/accounts/{id}` | Update nickname, color, `telegram_chat_id` |
| `GET` | `/accounts/{id}/note` | Get the note |
| `PUT` | `/accounts/{id}/note` | Update the note (`{"content": "..."}`) |
| `POST` | `/telegram/webhook` | Called by Telegram |

Example:

```bash
curl -s https://usageos.yourdomain.com/api/v1/accounts \
  -H "Authorization: Bearer $ATLAS_API_KEY" | python3 -m json.tool
```

## Data model

```
accounts           id, email, org_id, nickname, color, telegram_chat_id, subscription_tier, ...
sync_events        id, account_id, limits (JSONB), timestamp, ...
account_notes      account_id, content, updated_at
notification_log   id, account_id, limit_type, resets_at, notified_at   (unique per reset)
```

---

## Development

**Backend**

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Swagger docs at http://localhost:8000/docs
```

Migrations use Alembic with the **sync** driver (psycopg2):

```bash
docker compose exec backend alembic upgrade head
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Vite bakes `VITE_*` variables in at build time, so in Docker they must be passed as build args, not just runtime environment.

**Useful commands**

```bash
docker compose up -d --build backend     # rebuild after backend changes
docker compose up -d --build frontend    # rebuild after frontend changes
docker compose logs -f backend           # watch logs
docker compose exec postgres psql -U atlas -d atlas   # database shell
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Code changes don't take effect | `docker compose restart` does not pick up new builds. Use `docker compose up -d --build`. |
| Extension shows "Could not load manifest" | `extension/manifest.json` must exist and match `manifest_chrome.json`. Chrome needs that exact filename. |
| Extension can't reach the server | Check the Server URL, that your domain is listed under `host_permissions` in the manifest, and use **Test Connection** on the Options page. |
| "Receiving end does not exist" / context invalidated | Refresh your claude.ai tabs and reload the extension in `chrome://extensions`. |
| Account shows "Unknown" email | Email is derived from the organization name (`"<email>'s Organization"`), so Team or custom-named orgs can't be resolved. The nickname still works. |
| 502 from the reverse proxy | The proxy and the frontend container must share a Docker network so the container name resolves. |
| CORS errors | `CORS_ORIGINS` must match the dashboard URL exactly. |
| No Telegram alerts | Confirm the webhook returned `{"ok":true}`, a chat ID is saved on the account, and a reset is actually within 10 minutes. |

## Security notes

- Treat `ATLAS_API_KEY` and `TELEGRAM_BOT_TOKEN` like passwords. Never commit `.env`.
- If a secret is ever pasted somewhere public, rotate it: change the Postgres password in `.env` and recreate the containers; generate a new API key and update both `.env` and the extension Options page; use `/revoke` with @BotFather for a new bot token.
- Expose the stack only through HTTPS.

## License

The extension is derived from GPL-3.0 code, so it remains under GPL-3.0. See the license files in the repository for details.
