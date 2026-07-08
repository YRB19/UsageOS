import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_api_key
from ..database import get_db
from ..models import UsageSnapshot
from ..schemas import SnapshotOut

router = APIRouter(prefix="/api/v1/accounts", tags=["history"])

@router.get("/{account_id}/history", response_model=list[SnapshotOut], dependencies=[Depends(require_api_key)])
async def get_history(
    account_id: uuid.UUID,
    limit_type: str = Query("session", description="session | weekly | sonnet_weekly | opus_weekly"),
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(UsageSnapshot)
        .where(
            UsageSnapshot.account_id == account_id,
            UsageSnapshot.limit_type == limit_type,
            UsageSnapshot.recorded_at >= since,
        )
        .order_by(UsageSnapshot.recorded_at.asc())
    )
    return [SnapshotOut.model_validate(s) for s in result.scalars().all()]
