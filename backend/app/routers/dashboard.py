from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_api_key
from ..database import get_db
from ..models import Account, CurrentUsage
from ..schemas import DashboardResponse, DashboardAccount, CurrentUsageOut

router = APIRouter(prefix="/api/v1", tags=["dashboard"])

@router.get("/dashboard", response_model=DashboardResponse, dependencies=[Depends(require_api_key)])
async def dashboard(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Account)
        .where(Account.is_active == True)
        .options(selectinload(Account.current_usage), selectinload(Account.note))
        .order_by(Account.last_seen_at.desc().nulls_last())
    )
    accounts = result.scalars().all()

    out = []
    for acc in accounts:
        usage_map: dict[str, CurrentUsageOut | None] = {}
        for cu in acc.current_usage:
            usage_map[cu.limit_type] = CurrentUsageOut.model_validate(cu)

        out.append(DashboardAccount(
            id=acc.id,
            email=acc.email,
            nickname=acc.nickname,
            project_name=acc.project_name,
            color=acc.color,
            subscription_tier=acc.subscription_tier,
            last_seen_at=acc.last_seen_at,
            current_usage=usage_map,
            note=acc.note.content if acc.note else "",
        ))

    return DashboardResponse(accounts=out)


@router.get("/health", tags=["health"])
async def health(db: AsyncSession = Depends(get_db)):
    count = (await db.execute(select(Account).where(Account.is_active == True))).scalars()
    return {"status": "ok", "db": "ok", "accounts": len(list(count))}
