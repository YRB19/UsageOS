"""Notification management endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from ..database import get_db
from ..auth import require_api_key
from ..models import Account
from ..services.notifications import send_test_notification

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"], dependencies=[Depends(require_api_key)])


class TestNotificationRequest(BaseModel):
    account_id: str
    channel: str  # "telegram" or "whatsapp"


class NotificationPreferences(BaseModel):
    notify_telegram: bool = False
    telegram_chat_id: str | None = None
    notify_whatsapp: bool = False
    whatsapp_number: str | None = None
    notify_reset: bool = True
    notify_threshold: float | None = None


@router.post("/test")
async def test_notification(
    request: TestNotificationRequest,
    db: AsyncSession = Depends(get_db)
):
    """Send a test notification to verify configuration."""
    result = await db.execute(select(Account).where(Account.id == request.account_id))
    account = result.scalar_one_or_none()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    success = await send_test_notification(account, request.channel)

    return {
        "success": success,
        "message": f"Test {request.channel} notification {'sent' if success else 'failed'}"
    }


@router.get("/preferences/{account_id}")
async def get_notification_preferences(
    account_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get notification preferences for an account."""
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    return NotificationPreferences(
        notify_telegram=account.notify_telegram,
        telegram_chat_id=account.telegram_chat_id,
        notify_whatsapp=account.notify_whatsapp,
        whatsapp_number=account.whatsapp_number,
        notify_reset=account.notify_reset,
        notify_threshold=account.notify_threshold
    )


@router.put("/preferences/{account_id}")
async def update_notification_preferences(
    account_id: str,
    prefs: NotificationPreferences,
    db: AsyncSession = Depends(get_db)
):
    """Update notification preferences for an account."""
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    account.notify_telegram = prefs.notify_telegram
    account.telegram_chat_id = prefs.telegram_chat_id
    account.notify_whatsapp = prefs.notify_whatsapp
    account.whatsapp_number = prefs.whatsapp_number
    account.notify_reset = prefs.notify_reset
    account.notify_threshold = prefs.notify_threshold

    await db.commit()
    await db.refresh(account)

    return await get_notification_preferences(account_id, db)