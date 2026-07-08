import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_api_key
from ..database import get_db
from ..models import Account, AccountNote
from ..schemas import NoteOut, NotePut

router = APIRouter(prefix="/api/v1/accounts", tags=["notes"])

@router.get("/{account_id}/notes", response_model=NoteOut, dependencies=[Depends(require_api_key)])
async def get_note(account_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AccountNote).where(AccountNote.account_id == account_id))
    note = result.scalar_one_or_none()
    if not note:
        return NoteOut(content="", updated_at=datetime.now(timezone.utc))
    return NoteOut(content=note.content, updated_at=note.updated_at)

@router.put("/{account_id}/notes", response_model=NoteOut, dependencies=[Depends(require_api_key)])
async def put_note(account_id: uuid.UUID, body: NotePut, db: AsyncSession = Depends(get_db)):
    # ensure account exists
    acc = (await db.execute(select(Account).where(Account.id == account_id))).scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    result = await db.execute(select(AccountNote).where(AccountNote.account_id == account_id))
    note = result.scalar_one_or_none()
    now  = datetime.now(timezone.utc)

    if note:
        note.content    = body.content
        note.updated_at = now
    else:
        note = AccountNote(account_id=account_id, content=body.content, updated_at=now)
        db.add(note)

    await db.commit()
    return NoteOut(content=note.content, updated_at=note.updated_at)
