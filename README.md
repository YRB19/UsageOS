# UsageOS

**Self-hosted multi-account Claude.ai usage tracking platform.** Track token usage across multiple Claude.ai accounts with a Chrome extension, view analytics in a React dashboard, and receive limit-reset notifications via Telegram.

## Architecture Overview

```
┌─────────────────┐     HTTPS      ┌──────────────┐
│  Chrome Ext.    │ ─────────────▶ │  FastAPI     │
│  (MV3, vanilla) │  Sync + API    │  + PostgreSQL│
└─────────────────┘                └──────┬───────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
             ┌──────────────┐      ┌──────────────┐     ┌──────────────┐
             │  React       │      │  Extension   │     │  Telegram    │
             │  Dashboard   │      │  Dashboard   │     │  Bot         │
             │  (React/Vite)│      │  (HTML/JS)   │     │  (Webhook)   │
             └──────────────┘      └──────────────┘     └──────────────┘
```

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- A domain with DNS pointing to your server (for HTTPS via Caddy)
- Chrome/Chromium/Brave browser

### One-Command Deploy
```bash
git clone https://github.com/YRB19/UsageOS.git
cd UsageOS
cp .env.example .env    # Edit with your values
docker compose up -d
```

### Access Points
| Service | URL |
|---------|-----|
| Dashboard | `https://your-domain.com` |
| API Docs | `https://your-domain.com/docs` |
| Extension Dashboard | `chrome-extension://<id>/dashboard.html` |

### First-Time Setup
1. Open the dashboard, click **Settings** (gear icon)
2. Enter your **ATLAS_URL** (e.g., `https://usageos.yourdomain.com`)
3. Enter your **ATLAS_API_KEY** (from `.env` → `ATLAS_API_KEY`)
4. Save → extension will start syncing automatically

---

## Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Chrome Extension** | MV3, vanilla JS | Captures usage from claude.ai, injects UI, syncs to backend |
| **Backend API** | FastAPI + PostgreSQL | Sync endpoint, accounts CRUD, Telegram webhook, notifications |
| **Frontend Dashboard** | React 18 + Vite + Tailwind | Multi-account grid, usage bars, history charts, notes |
| **Extension Dashboard** | HTML/JS/Chart.js | Per-account detail view with time-series charts |
| **Telegram Bot** | HTTP webhook | `note`/`usage` commands, outbound limit-reset notifications |

---

## Chrome Extension (Overview)

### What It Does
- Intercepts claude.ai API responses (`/completion`, `/retry_completion`, `/billing`, `/account_profile`)
- Extracts token usage, limits, subscription tier, reset timestamps
- Syncs to UsageOS backend via `getPopupUsageData` / `atlasSync`
- Injects a floating usage widget into claude.ai pages
- Supports multi-container (Chrome profiles, Brave, Electron)

### Key Features
- **Multi-account**: Track multiple Claude organizations simultaneously
- **Per-account nicknames & colors**: Visual distinction in dashboard
- **Per-account notes**: Auto-saved, synced via backend
- **Telegram linking**: Set `telegram_chat_id` per account for notifications
- **Container isolation**: Works across Chrome profiles, Brave, Electron

### Data Flow
```
claude.ai API response → Content script extracts usage →
Background service worker batches → POST /api/v1/sync →
PostgreSQL → Dashboard reads via GET /api/v1/accounts
```

### Installation
1. `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/`
2. Or install from Chrome Web Store (when published)
3. Open `claude.ai` → widget appears automatically
3. Right-click extension icon → **Options** → enter server URL + API key

---

## Backend API Reference

Base URL: `https://your-domain.com/api/v1`

### Accounts
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/accounts` | List all accounts with latest usage + notes |
| `GET` | `/accounts/{id}` | Single account detail |
| `PATCH` | `/accounts/{id}` | Update nickname, color, `telegram_chat_id` |
| `GET` | `/accounts/{id}/sync-history?limit=50` | Full sync history for charts |
| `GET` | `/accounts/{id}/note` | Get note content |
| `PUT` | `/accounts/{id}/note` | Update note content |

### Sync (Extension → Backend)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sync` | Extension posts usage data (batched, retried offline) |

### Telegram
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/telegram/webhook` | Bot webhook endpoint |

### Health
| Method | Endpoint |
|--------|----------|
| `GET` | `/health` |

### Example: List Accounts
```bash
curl https://usageos.yourdomain.com/api/v1/accounts
```

---

## Frontend Dashboard

### Tech Stack
- **React 18** + **Vite** + **TypeScript**
- **Tailwind CSS** + **Framer Motion** animations
- **Recharts** for history sparklines
- **Axios** for API, **Lucide** icons

### Routes
| Route | Component |
|-------|-----------|
| `/` | `Dashboard` (account grid) |
| `/account/:id` | `AccountHistoryPage` (detail + Chart.js) |

### Key Components
| Component | Purpose |
|-----------|---------|
| `AccountCard` | Grid item: avatar, nickname, status badge, usage bars, notes |
| `UsageBar` | Animated 3px progress bar with color-coded threshold |
| `HistoryChart` | Expandable Recharts sparkline (session/weekly/sonnet/opus) |
| `NotesTextarea` | Debounced auto-save (600ms) |
| `TelegramChatIdPicker` | Modal to link Telegram chat ID |
| `Header` | Sticky, glassmorphism, live clock + refresh |

---

## Telegram Bot (Brief)

### Setup
```bash
# 1. Create bot via @BotFather → get TOKEN
# 2. Set webhook:
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d url="https://your-domain.com/api/v1/telegram/webhook"
```

### Commands
| Command | Description |
|---------|-------------|
| `note <nickname> <text>` | Save note to account |
| `usage` | All accounts summary |
| `usage <nickname>` | Single account detail |
| `help` | Show commands |

### Notifications
- Sent when any account's limit resets within 10 minutes
- Requires `telegram_chat_id` set on account (via dashboard or `PATCH /accounts/{id}`)

---

## Deployment

### Docker Compose (Production)
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck: pg_isready -U ${POSTGRES_USER}

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      ATLAS_API_KEY: ${ATLAS_API_KEY}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
    depends_on: [postgres]

  frontend:
    build: ./frontend
    ports: ["3000:80"]
    depends_on: [backend]
```

### Caddy Reverse Proxy (HTTPS)
```caddyfile
usageos.yourdomain.com {
    reverse_proxy frontend:80
    header Strict-Transport-Security max-age=31536000
}

api.yourdomain.com {
    reverse_proxy backend:8000
}
```

### Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| `POSTGRES_USER` | DB username | Yes |
| `POSTGRES_PASSWORD` | DB password | Yes |
| `POSTGRES_DB` | DB name | Yes |
| `ATLAS_API_KEY` | Extension auth key | Yes |
| `TELEGRAM_BOT_TOKEN` | BotFather token | No (for bot) |
| `CORS_ORIGINS` | Frontend URL(s) | Yes |

---

## Configuration

### Extension Options Page
| Field | Description |
|-------|-------------|
| **Server URL** | `https://api.yourdomain.com` (no trailing slash) |
| **API Key** | Value of `ATLAS_API_KEY` from `.env` |

### `.env.example`
```env
POSTGRES_USER=atlas
POSTGRES_PASSWORD=changeme
POSTGRES_DB=atlas
ATLAS_API_KEY=sk_usageos_abcdef123456
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
CORS_ORIGINS=https://usageos.yourdomain.com
```

---

## Development

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# API at http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# http://localhost:5173 (proxies /api to backend:8000)
```

### Extension
```bash
cd extension
npm install
npm run build          # builds to dist/
# Load dist/ as unpacked extension
```

---

## Architecture Notes

### Database Schema
```sql
accounts (id, provider, email, org_id, nickname, color, telegram_chat_id, subscription_tier, created_at)
sync_events (id, account_id, email, org_id, subscription_tier, limits JSONB, timestamp)
account_notes (account_id PK, content, updated_at)
notification_log (id, account_id, limit_type, resets_at, notified_at)
```

### Container Strategies
| Platform | Strategy |
|----------|----------|
| Chrome | `chrome.cookies` + `cookieStoreId` |
| Brave | Same as Chrome |
| Firefox | `contextualIdentities` |
| Electron | Custom protocol handler |

### Scheduler
- Runs every 60s in background service worker
- Checks limits resetting within 10 minutes
- Sends Telegram notification (deduped via `notification_log`)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Extension stuck "Loading accounts..."** | Refresh any open `claude.ai` tabs → reopen dashboard |
| **"Receiving end does not exist"** | Content script not injected → refresh `claude.ai` tabs |
| **Chart.js CSP error** | Ensure `lib/chart.umd.min.js` in `web_accessible_resources` |
| **Telegram webhook 404** | Verify `TELEGRAM_BOT_TOKEN` set, run `setWebhook` again |
| **Extension context invalidated** | Reload extension in `chrome://extensions` |
| **CORS errors** | Check `CORS_ORIGINS` matches dashboard URL exactly |

---

## License
MIT — see [LICENSE](LICENSE)

---

## Contributing
1. Fork → feature branch → PR
2. Run lint: `npm run lint` (frontend), `ruff check` (backend)
3. Tests: `npm test` / `pytest`

---

*Built with ❤️ for the Claude power-user community.*