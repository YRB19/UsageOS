"""
POST /api/v1/sync

Called by the Chrome extension after every Claude message completion.
Upserts account + current_usage, appends usage_snapshots.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_api_key
from ..database import get_db
from ..models import Provider, Account, UsageSnapshot, CurrentUsage
from ..schemas import SyncRequest, SyncResponse

router = APIRouter(prefix="/api/v1", tags=["sync"])


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@router.post("/sync", response_model=SyncResponse, dependencies=[Depends(require_api_key)])
async def sync_usage(payload: SyncRequest, db: AsyncSession = Depends(get_db)):
    # 1. Resolve provider
    provider = (await db.execute(
        select(Provider).where(Provider.slug == payload.provider)
    )).scalar_one_or_none()

    if not provider:
        from ..models import Provider as P
        provider = P(slug=payload.provider, display_name=payload.provider.capitalize())
        db.add(provider)
        await db.flush()

    # 2. Upsert account
    stmt = (
        pg_insert(Account)
        .values(
            provider_id=provider.id,
            email=payload.email or f"unknown@{payload.org_id}",
            org_id=payload.org_id,
            subscription_tier=payload.subscription_tier,
            last_seen_at=utcnow(),
        )
        .on_conflict_do_update(
            constraint="uq_provider_email",
            set_={
                "org_id":            payload.org_id,
                "subscription_tier": payload.subscription_tier,
                "last_seen_at":      utcnow(),
            }
        )
        .returning(Account.id, Account.created_at)
    )
    result  = await db.execute(stmt)
    row     = result.fetchone()
    account_id = row.id
    created    = row.created_at > (utcnow().replace(second=0, microsecond=0))  # rough heuristic

    # 3. Upsert current_usage + append snapshots
    for limit_type, limit_data in (payload.limits or {}).items():
        if limit_data is None:
            continue

        # current_usage upsert
        cu_stmt = (
            pg_insert(CurrentUsage)
            .values(
                account_id=account_id,
                limit_type=limit_type,
                usage_pct=limit_data.usage_pct,
                resets_at=limit_data.resets_at,
                updated_at=utcnow(),
            )
            .on_conflict_do_update(
                index_elements=["account_id", "limit_type"],
                set_={
                    "usage_pct":  limit_data.usage_pct,
                    "resets_at":  limit_data.resets_at,
                    "updated_at": utcnow(),
                }
            )
        )
        await db.execute(cu_stmt)

        # snapshot append
        db.add(UsageSnapshot(
            account_id=account_id,
            limit_type=limit_type,
            usage_pct=limit_data.usage_pct or 0.0,
            resets_at=limit_data.resets_at,
            source="extension",
        ))

    await db.commit()
    return SyncResponse(account_id=account_id, created=created)
