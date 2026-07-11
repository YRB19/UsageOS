from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from app.database import get_sync_db
from app.models import Account, AccountNote
from app.telegram import send_telegram_message

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])

@router.post("/webhook")
async def telegram_webhook(request: Request, db: Session = Depends(get_sync_db)):
    payload = await request.json()
    message = payload.get("message", {})
    text = message.get("text", "").strip()
    incoming_chat_id = str(message.get("chat", {}).get("id", ""))

    if not text.lower().startswith("note "):
        return {"ok": True}

    parts = text[5:].strip().split(" ", 1)
    if len(parts) < 2:
        if incoming_chat_id:
            await send_telegram_message(incoming_chat_id, "Usage: note <nickname> <your note text>")
        return {"ok": True}

    nickname_query, content = parts[0], parts[1]

    accounts = db.query(Account).all()
    matches = [
        a for a in accounts
        if (a.nickname and nickname_query.lower() in a.nickname.lower())
        or (a.email and nickname_query.lower() in a.email.lower())
    ]

    if len(matches) == 0:
        await send_telegram_message(incoming_chat_id, f"No account matching '{nickname_query}' found.")
        return {"ok": True}
    if len(matches) > 1:
        names = ", ".join(a.nickname or a.email or a.org_id for a in matches)
        await send_telegram_message(incoming_chat_id, f"Multiple accounts match '{nickname_query}': {names}. Be more specific.")
        return {"ok": True}

    account = matches[0]
    note = db.query(AccountNote).filter(AccountNote.account_id == account.id).first()
    if note:
        note.content = content
    else:
        note = AccountNote(account_id=account.id, content=content)
        db.add(note)
    db.commit()

    name = account.nickname or account.email or account.org_id
    reply_chat_id = account.telegram_chat_id or incoming_chat_id
    await send_telegram_message(reply_chat_id, f"✅ Note updated for {name}:\n{content}")
    return {"ok": True}