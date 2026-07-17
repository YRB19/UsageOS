from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import sync, accounts, telegram_webhook, maintenance
from app.database import sync_engine, Base
from app.telegram import send_telegram_message
from app.database import SyncSessionLocal
from app.models import Account, SyncEvent, NotificationLog, AccountNote
from sqlalchemy.exc import IntegrityError
import asyncio
from datetime import datetime, timezone, timedelta
import logging

logging.basicConfig(level=logging.INFO)
logging.getLogger("uvicorn").setLevel(logging.INFO)

Base.metadata.create_all(bind=sync_engine)

NOTIFY_WINDOW_MINUTES = 10
RESET_NOTIFY_WINDOW_MINUTES = 1  # 1 minute before reset


async def check_upcoming_resets():
    """Check for limits that will reset within NOTIFY_WINDOW_MINUTES and send pre-reset notifications."""
    while True:
        try:
            db = SyncSessionLocal()
            now = datetime.now(timezone.utc)
            window_end = now + timedelta(minutes=NOTIFY_WINDOW_MINUTES)

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
                    resets_at = datetime.fromisoformat(data["resets_at"].replace("Z", "+00:00"))
                    if now < resets_at <= window_end:
                        log_entry = NotificationLog(
                            account_id=account.id,
                            limit_type=limit_type,
                            resets_at=resets_at,
                            notification_type='pre_reset',
                        )
                        db.add(log_entry)
                        try:
                            db.commit()
                        except IntegrityError:
                            db.rollback()
                            continue  # already notified for this exact reset

                        note = db.query(AccountNote).filter(AccountNote.account_id == account.id).first()
                        note_text = note.content if note and note.content else "(no notes)"
                        name = account.nickname or account.email or account.org_id

                        minutes_left = int((resets_at - now).total_seconds() / 60)
                        message = (
                            f"⏰ <b>{name}</b>\n"
                            f"{limit_type.replace('_', ' ').title()} limit resets in ~{minutes_left}m\n\n"
                            f"📝 Notes:\n{note_text}"
                        )
                        await send_telegram_message(account.telegram_chat_id, message)

            db.close()
        except Exception as e:
            print(f"[scheduler] error: {e}")

        await asyncio.sleep(60)


async def check_reset_notifications():
    """Check for limits that will reset within RESET_NOTIFY_WINDOW_MINUTES and send reset notifications."""
    while True:
        try:
            db = SyncSessionLocal()
            now = datetime.now(timezone.utc)
            window_end = now + timedelta(minutes=RESET_NOTIFY_WINDOW_MINUTES)

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
                    resets_at = datetime.fromisoformat(data["resets_at"].replace("Z", "+00:00"))
                    if now < resets_at <= window_end:
                        log_entry = NotificationLog(
                            account_id=account.id,
                            limit_type=limit_type,
                            resets_at=resets_at,
                            notification_type='reset',
                        )
                        db.add(log_entry)
                        try:
                            db.commit()
                        except IntegrityError:
                            db.rollback()
                            continue  # already notified for this exact reset

                        note = db.query(AccountNote).filter(AccountNote.account_id == account.id).first()
                        note_text = note.content if note and note.content else "(no notes)"
                        name = account.nickname or account.email or account.org_id

                        message = (
                            f"✅ <b>{name}</b>\n"
                            f"{limit_type.replace('_', ' ').title()} limit resets in ~1m\n\n"
                            f"📝 Notes:\n{note_text}"
                        )
                        await send_telegram_message(account.telegram_chat_id, message)

            db.close()
        except Exception as e:
            print(f"[scheduler] error: {e}")

        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pre_reset_task = asyncio.create_task(check_upcoming_resets())
    reset_task = asyncio.create_task(check_reset_notifications())
    yield
    pre_reset_task.cancel()
    reset_task.cancel()


app = FastAPI(title="UsageOS Backend", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sync.router, prefix="/api/v1", tags=["sync"])
app.include_router(accounts.router, prefix="/api/v1/accounts", tags=["accounts"])
app.include_router(telegram_webhook.router)
app.include_router(maintenance.router)

@app.get("/")
async def root():
    return {"service": "UsageOS Backend", "status": "running"}