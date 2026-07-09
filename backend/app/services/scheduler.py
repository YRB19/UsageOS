"""Background scheduler for periodic tasks like reset notifications."""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import asyncio
import logging

from ..database import async_session_maker
from ..models import Account, CurrentUsage
from .notifications import send_reset_notification, send_threshold_notification

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


async def check_reset_notifications():
    """Check for accounts that need reset notifications."""
    async with async_session_maker() as session:
        # Find accounts with notify_reset enabled
        result = await session.execute(
            select(Account).where(
                Account.notify_reset == True,
                Account.is_active == True
            )
        )
        accounts = result.scalars().all()

        for account in accounts:
            # Get current usage for this account
            usage_result = await session.execute(
                select(CurrentUsage).where(CurrentUsage.account_id == account.id)
            )
            usages = usage_result.scalars().all()

            for usage in usages:
                if usage.resets_at and usage.usage_pct is not None:
                    # Check if reset happened recently (within last hour)
                    from datetime import datetime, timezone
                    now = datetime.now(timezone.utc)
                    time_since_reset = now - usage.resets_at.replace(tzinfo=timezone.utc)

                    if 0 <= time_since_reset.total_seconds() <= 3600:  # Within 1 hour of reset
                        await send_reset_notification(account, usage)


async def check_threshold_notifications():
    """Check for accounts that exceeded their threshold."""
    async with async_session_maker() as session:
        result = await session.execute(
            select(Account).where(
                Account.notify_threshold.isnot(None),
                Account.is_active == True
            )
        )
        accounts = result.scalars().all()

        for account in accounts:
            usage_result = await session.execute(
                select(CurrentUsage).where(CurrentUsage.account_id == account.id)
            )
            usages = usage_result.scalars().all()

            for usage in usages:
                if usage.usage_pct is not None and usage.usage_pct >= account.notify_threshold:
                    await send_threshold_notification(account, usage)


def start_scheduler():
    """Start the background scheduler."""
    global _scheduler
    if _scheduler is not None:
        return

    _scheduler = BackgroundScheduler()
    # Check every 15 minutes
    _scheduler.add_job(
        lambda: asyncio.run(check_reset_notifications()),
        trigger=CronTrigger(minute="*/15"),
        id="check_resets",
        replace_existing=True
    )
    _scheduler.add_job(
        lambda: asyncio.run(check_threshold_notifications()),
        trigger=CronTrigger(minute="*/15"),
        id="check_thresholds",
        replace_existing=True
    )
    _scheduler.start()
    logger.info("Background scheduler started")


def stop_scheduler():
    """Stop the background scheduler."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown()
        _scheduler = None
        logger.info("Background scheduler stopped")