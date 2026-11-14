from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import sync, accounts, telegram_webhook, maintenance
from app.routers import auth as auth_router
from app.routers import preferences as preferences_router
from app.routers import alerts as alerts_router
from app.routers import status as status_router
from app.database import sync_engine, Base
from app.migrations import run_migrations
from app.telegram import send_telegram_message
from app.database import SyncSessionLocal
from app.models import Account, SyncEvent, NotificationLog, AccountNote
from app.preferences import get_preferences
from sqlalchemy.exc import IntegrityError
import asyncio
from datetime import datetime, timezone, timedelta
import logging

logging.basicConfig(level=logging.INFO)
logging.getLogger("uvicorn").setLevel(logging.INFO)

# Bring the schema up to date (also creates everything on a fresh database).
run_migrations()
# Safety net: create anything a model defines that no migration covers yet.
Base.metadata.create_all(bind=sync_engine)

RESET_NOTIFY_WINDOW_MINUTES = 1  # final "resets in ~1m" message


def _limit_enabled(limit_type: str, prefs: dict) -> bool:
    """Session limits follow the session toggle; every weekly-style limit follows the weekly toggle."""
    if limit_type == "session":
        return prefs["notify_session"]
    return prefs["notify_weekly"]


async def _notify_loop(kind: str):
    """Every 60s, message accounts whose limits reset inside the notification window.

    kind == 'pre_reset': window is the user-chosen number of minutes (Settings -> Notifications).
    kind == 'reset':     window is the final minute before the reset.
    Each (account, limit, reset time, kind) is notified once, enforced by a unique index.
    """
    while True:
        db = None
        try:
            db = SyncSessionLocal()
            prefs = get_preferences(db)
            now = datetime.now(timezone.utc)
            minutes = prefs["notify_minutes_before"] if kind == "pre_reset" else RESET_NOTIFY_WINDOW_MINUTES
            window_end = now + timedelta(minutes=minutes)

            accounts = db.query(Account).filter(Account.telegram_chat_id.isnot(None)).all()
            for account in accounts:
                latest = (
                    db.query(SyncEvent)
                    .filter(SyncEvent.account_id == account.id)
                    .order_by(SyncEvent.timestamp.desc())
                    .first()
                )
                if not latest or not latest.limits:
                    continue

                for limit_type, data in latest.limits.items():
                    if not data or not data.get("resets_at"):
                        continue
                    if not _limit_enabled(limit_type, prefs):
                        continue
                    resets_at = datetime.fromisoformat(data["resets_at"].replace("Z", "+00:00"))
                    if not (now < resets_at <= window_end):
                        continue

                    db.add(NotificationLog(
                        account_id=account.id,
                        limit_type=limit_type,
                        resets_at=resets_at,
                        notification_type=kind,
                    ))
                    try:
                        db.commit()
                    except IntegrityError:
                        db.rollback()
                        continue  # already notified for this exact reset

                    note = db.query(AccountNote).filter(AccountNote.account_id == account.id).first()
                    note_text = note.content if note and note.content else "(no notes)"
                    name = account.nickname or account.email or account.org_id
                    label = limit_type.replace("_", " ").title()

                    if kind == "pre_reset":
                        minutes_left = int((resets_at - now).total_seconds() / 60)
                        message = (
                            f"⏰ <b>{name}</b>\n"
                            f"{label} limit resets in ~{minutes_left}m\n\n"
                            f"📝 Notes:\n{note_text}"
                        )
                    else:
                        message = (
                            f"✅ <b>{name}</b>\n"
                            f"{label} limit resets in ~1m\n\n"
                            f"📝 Notes:\n{note_text}"
                        )
                    await send_telegram_message(account.telegram_chat_id, message)
        except Exception as e:
            print(f"[scheduler:{kind}] error: {e}")
        finally:
            if db is not None:
                db.close()

        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pre_reset_task = asyncio.create_task(_notify_loop("pre_reset"))
    reset_task = asyncio.create_task(_notify_loop("reset"))
    yield
    pre_reset_task.cancel()
    reset_task.cancel()


app = FastAPI(title="UsageOS Backend", version="1.1.0", lifespan=lifespan)

# The dashboard is same-origin (nginx proxies /api), and the extension authenticates with a
# Bearer key, so CORS never needs to carry cookies.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sync.router, prefix="/api/v1", tags=["sync"])
app.include_router(auth_router.router)
app.include_router(accounts.router, prefix="/api/v1/accounts", tags=["accounts"])
app.include_router(accounts.public_router, prefix="/api/v1/accounts", tags=["accounts"])
app.include_router(preferences_router.router)
app.include_router(alerts_router.router)
app.include_router(status_router.router)
app.include_router(telegram_webhook.router)
app.include_router(maintenance.router)


@app.get("/")
async def root():
    return {"service": "UsageOS Backend", "status": "running"}
