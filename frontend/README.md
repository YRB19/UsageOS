# UsageOS

Self-hosted multi-account Claude.ai usage tracking platform. Monitor limits, manage notes, and get notified before resets across all your accounts from a single dashboard.

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│   Extension  │───▶│    Backend   │───▶│   PostgreSQL  │
│  (Chrome)    │    │   (FastAPI)  │    │    (16-alpine)│
└─────────────┘    └──────┬───────┘    └──────────────┘
                          │
                   ┌──────▼───────┐
                   │   Frontend   │
                   │  (React/Vite)│
                   └──────────────┘
                          │
                   ┌──────▼───────┐
                   │   Telegram   │
                   │  Notifications│
                   └──────────────┘
```

## Components

### Chrome Extension

A modified fork of [Claude Usage Tracker](https://github.com/lugia19/Claude-Usage-Tracker) that intercepts usage data from `claude.ai` and pushes it to the UsageOS backend via the Atlas API.

**Permissions:** Storage, alarms, webRequest, cookies, tabs, contextMenus, notifications.

### Backend (FastAPI)

- **Sync endpoint** — receives usage data from the extension
- **Accounts API** — list, update nicknames/colors, manage notes
- **Telegram integration** — inbound commands (`note <name> <text>`) + outbound notifications for upcoming limit resets
- **Background scheduler** — checks every 60s for limits resetting within 10 minutes
- **Alembic migrations** for schema versioning

### Frontend (React + Vite)

Minimal dark dashboard (inspired by Linear/Vercel) with:

- **Per-account cards** with color-coded borders, nicknames, and subscription tier badges
- **Usage bars** for session, weekly, Sonnet weekly, and Opus weekly limits
- **Clickable progress** — hover for countdown timers and reset timestamps
- **Inline notes** — debounced autosave per account
- **History charts** — session usage over time via Recharts sparklines
- **Telegram chat ID picker** — link accounts to Telegram for notifications
- **Color picker** — 8 preset colors for account organization
- **Live polling** — refreshes every 30 seconds

## Quick Start

### Prerequisites

- Docker & Docker Compose
- An external Docker network named `atlas-network` (for Caddy reverse proxy)

### Setup

```bash
git clone https://github.com/YRB19/UsageOS.git
cd UsageOS
cp .env.example .env
# Edit .env with your credentials
docker compose up -d
```

The dashboard will be available at `http://localhost:3000`.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_USER` | Yes | Database username |
| `POSTGRES_PASSWORD` | Yes | Database password |
| `POSTGRES_DB` | Yes | Database name |
| `ATLAS_API_KEY` | Yes | API key for extension-to-backend auth |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token for notifications |
| `TWILIO_ACCOUNT_SID` | No | Twilio account SID (future use) |
| `TWILIO_AUTH_TOKEN` | No | Twilio auth token (future use) |
| `TWILIO_WHATSAPP_FROM` | No | Twilio WhatsApp number (future use) |

## Telegram Integration

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and get the token
2. Add `TELEGRAM_BOT_TOKEN` to your `.env`
3. Restart the backend: `docker compose up -d --build backend`
4. Register the webhook: `curl -X POST https://usageos.rishit.online/api/v1/telegram/webhook`

### Inbound Commands

Message the bot with:

```
note <account_nickname> <text>
```

This updates the notes for the matching account and replies with confirmation.

### Outbound Notifications

When a limit is approaching reset (within 10 minutes), the bot sends:

```
⏰ <account_name>
<Limit type> limit resets in ~<minutes>m

📝 Notes:
<account notes>
```

Each notification is deduplicated per account + limit type + reset time.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Health check |
| `POST` | `/api/v1/sync` | Receive usage data from extension |
| `GET` | `/api/v1/accounts` | List all accounts with usage + notes |
| `PATCH` | `/api/v1/accounts/:id` | Update nickname, color, or telegram_chat_id |
| `GET` | `/api/v1/accounts/:id/sync-history` | Get usage history (last N events) |
| `GET` | `/api/v1/accounts/:id/note` | Get account notes |
| `PUT` | `/api/v1/accounts/:id/note` | Update account notes |
| `POST` | `/api/v1/telegram/webhook` | Telegram bot webhook (inbound messages) |

## Deployment

### Docker Compose

The stack runs three containers on the `atlas-network` external network:

| Service | Port | Description |
|---|---|---|
| `usageos-postgres` | 5432 | PostgreSQL database |
| `usageos-backend` | 8000 | FastAPI backend |
| `usageos-frontend` | 3000→80 | Nginx serving React app |

### Caddy Reverse Proxy

For `usageos.rishit.online`, add to your Caddyfile:

```
usageos.rishit.online {
    reverse_proxy usageos-frontend:80
}
```

### Migrations

```bash
# Run migrations inside the backend container
docker exec usageos-backend alembic upgrade head
```

## Development

### Backend

```bash
cd backend/app
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server runs on port 5173 with API proxy to `http://localhost:8000`.

## Project Structure

```
UsageOS/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + scheduler
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── schemas.py           # Pydantic schemas
│   │   ├── config.py            # Settings from env
│   │   ├── database.py          # DB engines + sessions
│   │   ├── telegram.py          # Telegram send helper
│   │   └── routers/
│   │       ├── accounts.py      # Account CRUD + notes
│   │       ├── sync.py          # Extension sync endpoint
│   │       └── telegram_webhook.py  # Inbound Telegram
│   └── alembic/versions/        # DB migrations
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── AccountCard.tsx   # Main account card
│       │   ├── UsageBar.tsx      # Progress bars
│       │   ├── EditableNickname.tsx  # Click-to-edit names
│       │   ├── ColorPicker.tsx   # Color selection
│       │   ├── NotesTextarea.tsx # Autosave notes
│       │   ├── HistoryChart.tsx  # Usage sparklines
│       │   └── TelegramChatIdPicker.tsx
│       ├── pages/Dashboard.tsx   # Main dashboard
│       └── lib/
│           ├── api.ts            # API client
│           ├── types.ts          # TypeScript types
│           └── utils.ts          # Helpers
├── extension/                    # Chrome extension (fork)
└── docker-compose.yml
```

## Credits

- Extension based on [Claude Usage Tracker](https://github.com/lugia19/Claude-Usage-Tracker) by lugia19
- Dashboard UI inspired by Linear and Vercel

## License

MIT
