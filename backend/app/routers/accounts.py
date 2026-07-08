import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..auth import require_api_key
from ..database import get_db
from ..models import Account
from ..schemas import AccountOut, AccountPatch, CurrentUsageOut

router = APIRouter(prefix="/api/v1/accounts", tags=["accounts"])

def _serialize(account: Account) -> AccountOut:
    return AccountOut(
        id=account.id,
        email=account.email,
        org_id=account.org_id,
        nickname=account.nickname,
        project_name=account.project_name,
        color=account.color,
        subscription_tier=account.subscription_tier,
        is_active=account.is_active,
        created_at=account.created_at,
        last_seen_at=account.last_seen_at,
        current_usage=[CurrentUsageOut.model_validate(cu) for cu in account.current_usage],
        note=account.note.content if account.note else None,
    )

@router.get("", response_model=list[AccountOut], dependencies=[Depends(require_api_key)])
async def list_accounts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Account)
        .where(Account.is_active == True)
        .options(selectinload(Account.current_usage), selectinload(Account.note))
        .order_by(Account.last_seen_at.desc().nulls_last())
    )
    return [_serialize(a) for a in result.scalars().all()]

@router.get("/{account_id}", response_model=AccountOut, dependencies=[Depends(require_api_key)])
async def get_account(account_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Account)
        .where(Account.id == account_id)
        .options(selectinload(Account.current_usage), selectinload(Account.note))
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return _serialize(account)

@router.patch("/{account_id}", response_model=AccountOut, dependencies=[Depends(require_api_key)])
async def patch_account(account_id: uuid.UUID, body: AccountPatch, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Account)
        .where(Account.id == account_id)
        .options(selectinload(Account.current_usage), selectinload(Account.note))
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(account, field, value)

    await db.commit()
    await db.refresh(account)
    return _serialize(account)
