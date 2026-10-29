# UsageOS

**A self-hosted dashboard for tracking usage across multiple Claude.ai accounts.**

Claude's built-in usage indicator only shows the account you're currently logged into. If you juggle several accounts (personal, work, per-project), you end up logging in and out just to check how much you have left. UsageOS fixes that: a browser extension quietly records usage from every account you use, and a web dashboard shows all of them side by side, with reset countdowns, notes, history charts and Telegram alerts.

- **All accounts, one screen**: session and weekly usage bars, subscription tier, time until reset
- **Nicknames, colors and notes** per account, auto-saved (notes are also editable from the claude.ai sidebar)
- **History charts** of usage over time
- **Telegram notifications** shortly before a limit resets, plus a bot you can message to add notes
- **Self-hosted**: your data lives in your own Postgres database, nothing goes to a third party

---

## How it works

```
Claude.ai (any account, in your browser)
        │
        ▼
Browser extension ── reads usage from claude.ai, computes usage %
        │  POST /api/v1/sync   (on every usage read; queued offline if the server is down)
        ▼
FastAPI backend ──► PostgreSQL
        │
        ├──► React dashboard (nginx serves the UI and proxies /api/ to the backend)
        │
        └──► Telegram scheduler (checks every 60s) ──► Telegram Bot API
                      ▲
                      └── Telegram webhook ◄── you reply "note <nickname> <text>"
```

1. **Capture.** The extension observes claude.ai's own requests and reads usage, limits, reset timestamps and subscription tier, and works out which account they belong to.
2. **Sync.** Every authoritative usage read (after a message, on a 3-minute heartbeat while a claude.ai tab is open, when the popup opens) posts a snapshot to `/api/v1/sync`, authenticated with your API key. Snapshots identical to the last one are skipped (a keep-alive goes out every 10 minutes). If the server is unreachable, snapshots are queued and retried automatically.
3. **Store.** The backend keeps the latest state per account plus a history of sync events for charts.
4. **View.** The React dashboard renders one card per account.
5. **Notify.** A background loop checks every 60 seconds for any limit resetting within 10 minutes and messages the Telegram chat linked to that account once per reset.

## Components

| Component | Tech | Role |
|---|---|---|
| `extension/` | Chrome MV3, vanilla JS | Reads usage from claude.ai and syncs it to the backend; popup, local dashboard, sidebar notes |
| `backend/` | FastAPI, SQLAlchemy, Alembic, PostgreSQL | Sync endpoint, accounts API, notes, Telegram webhook and scheduler |
| `frontend/` | React, Vite, TypeScript, Tailwind | Multi-account dashboard served by nginx |

The extension is a fork of [lugia19/Claude-Usage-Extension](https://github.com/lugia19/Claude-Usage-Extension) 6.1.4 (GPL-3.0), modified to sync to a self-hosted backend. Its donation and promotional elements were removed.

---

## Quick start

### Prerequisites
- Docker and Docker Compose
- A server (or any always-on machine)
- A domain with HTTPS if you want to reach it from other devices or use Telegram (webhooks need a public HTTPS URL). Caddy or a Cloudflare Tunnel works well.
- Chrome, Brave or another Chromium browser

### 1. Clone and configure
```bash
git clone https://github.com/YRB19/UsageOS.git
cd UsageOS
cp .env.example .env
```

| Variable | Description | Required |
|---|---|---|
| `POSTGRES_USER` | Database user | Yes |
| `POSTGRES_PASSWORD` | Database password, use something strong | Yes |
| `POSTGRES_DB` | Database name | Yes |
| `ATLAS_API_KEY` | Shared secret used by the extension and dashboard to authenticate to the backend | Yes |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather | Only for Telegram features |
| `CORS_ORIGINS` | Your dashboard URL, exactly as you open it in the browser | Yes |

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"   # good API key
```

### 2. Start the stack
```bash
docker compose up -d --build
curl -s http://localhost:3000/api/v1/health
```
If your `docker-compose.yml` attaches services to an external `atlas-network`, create it first with `docker network create atlas-network`, or remove it if you don't use a shared proxy.

### 3. Put it behind HTTPS (recommended)
```
usageos.yourdomain.com {
    reverse_proxy usageos-frontend:80
}
```

### 4. Install the extension
1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and select the `extension/` folder.
2. Click the extension icon, then **Server**. Enter your **Server URL** (`https://usageos.yourdomain.com`, no trailing slash) and the **API Key** (`ATLAS_API_KEY` from `.env`).
3. Press **Save**. Chrome asks whether to let the extension access your server: accept. (If you skip this, nothing can be sent.)
4. Press **Test Connection**. It reports separately whether the address or the key is wrong.
5. Open claude.ai in each account and send a message. The account appears on the dashboard after its first sync.

The Options page shows live sync status (last successful sync, queued snapshots, key problems). After changing extension code, click the reload icon on its card.

The extension ships with `manifest.json` (a copy of `manifest_chrome.json`) and the generated `content-components/ui_dataclasses.js`. If you change `shared/dataclasses.js`, regenerate with `node scripts/build-dataclasses.js`.

### 5. Optional: Telegram notifications
1. Create a bot with [@BotFather](https://t.me/BotFather), put the token in `.env` as `TELEGRAM_BOT_TOKEN`, then `docker compose up -d --build backend`.
2. Register the webhook:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://usageos.yourdomain.com/api/v1/telegram/webhook"
   ```
3. Message your bot, then find your chat ID (for example via [@userinfobot](https://t.me/userinfobot)).
4. On the dashboard, click the small **checkmark icon** next to an account's name, paste the chat ID and **Save**.

| Command | What it does |
|---|---|
| `note <nickname> <text>` | Saves a note on the account with that nickname |

---

## Using the dashboard
- Each card shows the account's identity, usage bars, tier and reset countdown.
- Click the nickname to rename an account; use the color picker to tell accounts apart.
- Type in the notes box; it auto-saves. The same note appears in the **Notes** box in the claude.ai sidebar and updates in both places.
- Expand a card to see its usage history chart.

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

## Data model
```
accounts           id, email, org_id, nickname, color, telegram_chat_id, subscription_tier, ...
sync_events        id, account_id, limits (JSONB), timestamp, ...
account_notes      account_id, content, updated_at
notification_log   id, account_id, limit_type, resets_at, notified_at   (unique per reset)
```

## Development
**Backend**
```bash
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000    # Swagger at http://localhost:8000/docs
docker compose exec backend alembic upgrade head   # Alembic uses the SYNC driver (psycopg2)
```
**Frontend**
```bash
cd frontend && npm install && npm run dev
```
Vite bakes `VITE_*` variables in at build time, so in Docker they must be build args.

```bash
docker compose up -d --build backend     # rebuild after backend changes
docker compose up -d --build frontend
docker compose logs -f backend
docker compose exec postgres psql -U atlas -d atlas
```

## Troubleshooting
| Problem | Fix |
|---|---|
| Code changes don't take effect | `docker compose restart` does not pick up new builds. Use `docker compose up -d --build`. |
| Extension shows "Could not load manifest" | `extension/manifest.json` must exist and match `manifest_chrome.json`; `content-components/ui_dataclasses.js` must exist (generate it, see above). |
| Nothing syncs | Open the extension's Options page and read the sync status line. Press **Save** again so Chrome can grant access to your server, then **Test Connection**. |
| "API key rejected" / red `!` on the icon | The key must match `ATLAS_API_KEY` exactly. Fix it in Options; sending resumes immediately and queued snapshots are sent. |
| Account shows "Unknown" email | The email is read from claude.ai; if that fails for Team or custom-named orgs it stays unknown. The nickname still works. |
| Notes box says it can't reach the server | Check the server URL in Options. Edits are kept on the device and uploaded when the server is reachable. |
| "Receiving end does not exist" / context invalidated | Refresh your claude.ai tabs and reload the extension in `chrome://extensions`. |
| 502 from the reverse proxy | The proxy and the frontend container must share a Docker network. |
| CORS errors | `CORS_ORIGINS` must match the dashboard URL exactly. |
| No Telegram alerts | Confirm the webhook returned `{"ok":true}`, a chat ID is saved on the account, and a reset is within 10 minutes. |

## Security notes
- Treat `ATLAS_API_KEY` and `TELEGRAM_BOT_TOKEN` like passwords. Never commit `.env`.
- If a secret leaks, rotate it: new Postgres password in `.env` and recreate containers; new API key in `.env` and the extension Options; `/revoke` with @BotFather for the bot token.
- Expose the stack only through HTTPS.

## License
The extension is derived from GPL-3.0 code and remains GPL-3.0. See the license files for details.