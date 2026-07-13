from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
from pathlib import Path
from app.database import get_sync_db
from app.models import Account, SyncEvent, AccountNote
from app.schemas import AccountOut, AccountPatch, NoteOut, NoteIn, SyncEventOut, AccountWithUsage
from app.auth import verify_api_key
from app.config import settings

router = APIRouter()

AVATAR_DIR = Path("/app/uploads/avatars")
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2MB
EXT_MAP = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


def _latest_limits_for(db: Session, account_id: str) -> list[dict]:
    latest = (
        db.query(SyncEvent)
        .filter(SyncEvent.account_id == account_id)
        .order_by(SyncEvent.timestamp.desc())
        .first()
    )
    if not latest or not latest.limits:
        return []

    result = []
    for limit_type, data in latest.limits.items():
        if data is None:
            continue
        result.append({
            "limit_type": limit_type,
            "usage_pct": data.get("usage_pct"),
            "resets_at": data.get("resets_at"),
            "updated_at": latest.timestamp.isoformat() if latest.timestamp else None,
        })
    return result


@router.get("", response_model=list[AccountWithUsage])
async def list_accounts(db: Session = Depends(get_sync_db)):
    accounts = db.query(Account).order_by(Account.created_at.desc()).all()
    result = []
    for a in accounts:
        note = db.query(AccountNote).filter(AccountNote.account_id == a.id).first()
        result.append({
            **{c.name: getattr(a, c.name) for c in a.__table__.columns},
            "limits": _latest_limits_for(db, a.id),
            "note": note.content if note else "",
        })
    return result


@router.get("/{account_id}", response_model=AccountOut)
async def get_account(account_id: str, db: Session = Depends(get_sync_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.patch("/{account_id}", response_model=AccountOut)
async def update_account(account_id: str, patch: AccountPatch, db: Session = Depends(get_sync_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if patch.nickname is not None:
        account.nickname = patch.nickname
    if patch.color is not None:
        account.color = patch.color
    if patch.telegram_chat_id is not None:
        account.telegram_chat_id = patch.telegram_chat_id
    db.commit()
    db.refresh(account)
    return account


@router.get("/{account_id}/sync-history", response_model=list[SyncEventOut])
async def get_account_sync_history(account_id: str, limit: int = 50, db: Session = Depends(get_sync_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    query = db.query(SyncEvent).filter(SyncEvent.account_id == account_id).order_by(SyncEvent.timestamp.asc())
    if limit > 0:
        query = query.limit(limit)
    events = query.all()
    return events


@router.get("/{account_id}/note", response_model=NoteOut)
async def get_note(account_id: str, db: Session = Depends(get_sync_db)):
    note = db.query(AccountNote).filter(AccountNote.account_id == account_id).first()
    if not note:
        return {"content": "", "updated_at": datetime.utcnow()}
    return note


@router.put("/{account_id}/note", response_model=NoteOut)
async def put_note(account_id: str, body: NoteIn, db: Session = Depends(get_sync_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    note = db.query(AccountNote).filter(AccountNote.account_id == account_id).first()
    if not note:
        note = AccountNote(account_id=account_id, content=body.content)
        db.add(note)
    else:
        note.content = body.content
    db.commit()
    db.refresh(note)
    return note


@router.post("/{account_id}/avatar", response_model=AccountOut)
async def upload_avatar(account_id: str, file: UploadFile = File(...), db: Session = Depends(get_sync_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid file type: {file.content_type}. Allowed: png, jpeg, webp")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large: {len(content)} bytes. Maximum: 2MB")

    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    ext = EXT_MAP[file.content_type]
    filename = f"{account_id}{ext}"
    filepath = AVATAR_DIR / filename

    # Remove old file if it exists with a different extension
    for old_ext in EXT_MAP.values():
        old_path = AVATAR_DIR / f"{account_id}{old_ext}"
        if old_path.exists() and old_path != filepath:
            old_path.unlink()

    filepath.write_bytes(content)

    avatar_url = f"/api/v1/accounts/{account_id}/avatar"
    account.avatar_url = avatar_url
    db.commit()
    db.refresh(account)
    return account


@router.get("/{account_id}/avatar")
async def get_avatar(account_id: str):
    account_path = None
    for ext in EXT_MAP.values():
        candidate = AVATAR_DIR / f"{account_id}{ext}"
        if candidate.exists():
            account_path = candidate
            break

    if not account_path:
        raise HTTPException(status_code=404, detail="No avatar found")

    # Determine content-type from extension
    content_type = "application/octet-stream"
    for mime, ext in EXT_MAP.items():
        if account_path.suffix == ext:
            content_type = mime
            break

    return FileResponse(
        path=str(account_path),
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=300"}
    )