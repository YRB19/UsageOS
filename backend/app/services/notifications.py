"""Notification delivery service for Telegram and WhatsApp."""
import httpx
import logging
from typing import Optional

from ..config import settings

logger = logging.getLogger(__name__)

# Telegram Bot API
TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/sendMessage"

# WhatsApp via Twilio (requires Twilio credentials)
WHATSAPP_API_URL = "https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"


async def send_telegram_message(chat_id: str, message: str, token: Optional[str] = None) -> bool:
    """Send a message via Telegram Bot API."""
    bot_token = token or getattr(settings, 'TELEGRAM_BOT_TOKEN', None)
    if not bot_token:
        logger.warning("Telegram bot token not configured")
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                TELEGRAM_API_URL.format(token=bot_token),
                json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"}
            )
            return response.status_code == 200
    except Exception as e:
        logger.error(f"Failed to send Telegram message: {e}")
        return False


async def send_whatsapp_message(to_number: str, message: str) -> bool:
    """Send a message via WhatsApp (Twilio)."""
    account_sid = getattr(settings, 'TWILIO_ACCOUNT_SID', None)
    auth_token = getattr(settings, 'TWILIO_AUTH_TOKEN', None)
    from_number = getattr(settings, 'TWILIO_WHATSAPP_FROM', None)

    if not all([account_sid, auth_token, from_number]):
        logger.warning("Twilio WhatsApp credentials not configured")
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                WHATSAPP_API_URL.format(account_sid=account_sid),
                auth=(account_sid, auth_token),
                data={"From": f"whatsapp:{from_number}", "To": f"whatsapp:{to_number}", "Body": message}
            )
            return response.status_code == 201
    except Exception as e:
        logger.error(f"Failed to send WhatsApp message: {e}")
        return False


def format_reset_message(account_email: str, limit_type: str, usage_pct: float) -> str:
    """Format a reset notification message."""
    return (
        f"🔄 <b>Usage Limit Reset</b>\n\n"
        f"Account: <code>{account_email}</code>\n"
        f"Limit: <b>{limit_type}</b>\n"
        f"Previous usage: {usage_pct:.1f}%\n\n"
        f"Your limit has reset! You now have full capacity again."
    )


def format_threshold_message(account_email: str, limit_type: str, usage_pct: float, threshold: float) -> str:
    """Format a threshold warning message."""
    return (
        f"⚠️ <b>Usage Threshold Reached</b>\n\n"
        f"Account: <code>{account_email}</code>\n"
        f"Limit: <b>{limit_type}</b>\n"
        f"Current usage: <b>{usage_pct:.1f}%</b>\n"
        f"Threshold: {threshold:.0%}\n\n"
        f"Consider waiting for reset or upgrading your plan."
    )


async def send_reset_notification(account, usage) -> bool:
    """Send reset notifications via configured channels."""
    success = True
    message = format_reset_message(account.email, usage.limit_type, usage.usage_pct or 0)

    if account.notify_telegram and account.telegram_chat_id:
        success &= await send_telegram_message(account.telegram_chat_id, message)

    if account.notify_whatsapp and account.whatsapp_number:
        success &= await send_whatsapp_message(account.whatsapp_number, message)

    return success


async def send_threshold_notification(account, usage) -> bool:
    """Send threshold notifications via configured channels."""
    if not account.notify_threshold:
        return True

    success = True
    message = format_threshold_message(
        account.email, usage.limit_type, usage.usage_pct or 0, account.notify_threshold
    )

    if account.notify_telegram and account.telegram_chat_id:
        success &= await send_telegram_message(account.telegram_chat_id, message)

    if account.notify_whatsapp and account.whatsapp_number:
        success &= await send_whatsapp_message(account.whatsapp_number, message)

    return success


async def send_test_notification(account, channel: str) -> bool:
    """Send a test notification to verify configuration."""
    if channel == "telegram" and account.notify_telegram and account.telegram_chat_id:
        return await send_telegram_message(
            account.telegram_chat_id,
            "✅ <b>Test Notification</b>\n\nTelegram notifications are working correctly for UsageOS!"
        )
    elif channel == "whatsapp" and account.notify_whatsapp and account.whatsapp_number:
        return await send_whatsapp_message(
            account.whatsapp_number,
            "✅ Test Notification\n\nWhatsApp notifications are working correctly for UsageOS!"
        )
    return False