from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_sync_db
from app.models import Account, AccountNote
from app.schemas import NoteOut, NoteIn

router = APIRouter()

@router.get("/{account_id}/note", response_model=NoteOut)
async def get_note(account_id: str, db: Session = Depends(get_sync_db)):
    note = db.query(AccountNote).filter(AccountNote.account_id == account_id).first()
    if not note:
        return {"content": "", "updated_at": None}
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