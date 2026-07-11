from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_sync_db
from app.models import Account, SyncEvent
from app.schemas import SyncPayload, SyncResponse, SyncEventOut, HealthResponse
from app.auth import verify_api_key
from datetime import datetime
from uuid import UUID

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
async def health_check():
    return {"status": "ok"}

@router.post("/sync", response_model=SyncResponse, dependencies=[Depends(verify_api_key)])
async def sync_usage(payload: SyncPayload, db: Session = Depends(get_sync_db)):
    account = db.query(Account).filter(Account.org_id == payload.org_id).first()
    if not account:
        account = Account(
            provider=payload.provider,
            email=payload.email,
            org_id=payload.org_id,
            subscription_tier=payload.subscription_tier
        )
        db.add(account)
        db.flush()
    else:
        account.email = payload.email or account.email
        account.subscription_tier = payload.subscription_tier or account.subscription_tier
        account.updated_at = datetime.utcnow()

    limits_dict = {
        "session": payload.limits.session.model_dump() if payload.limits.session else None,
        "weekly": payload.limits.weekly.model_dump() if payload.limits.weekly else None,
        "sonnet_weekly": payload.limits.sonnet_weekly.model_dump() if payload.limits.sonnet_weekly else None,
        "opus_weekly": payload.limits.opus_weekly.model_dump() if payload.limits.opus_weekly else None,
    }

    sync_event = SyncEvent(
        account_id=account.id,
        email=payload.email,
        org_id=payload.org_id,
        subscription_tier=payload.subscription_tier,
        limits=limits_dict,
        timestamp=payload.timestamp
    )
    db.add(sync_event)
    db.commit()
    db.refresh(account)
    return {"account_id": account.id}

@router.get("/sync/{org_id}", response_model=list[SyncEventOut], dependencies=[Depends(verify_api_key)])
async def get_sync_history(org_id: str, limit: int = 50, db: Session = Depends(get_sync_db)):
    events = db.query(SyncEvent).filter(SyncEvent.org_id == org_id).order_by(SyncEvent.timestamp.desc()).limit(limit).all()
    return events