from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from app.database import get_sync_db
from app.models import Account, SyncEvent, AccountNote
from app.telegram import send_telegram_message
from datetime import datetime, timezone
import logging

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])

logger = logging.getLogger(__name__)

LIMIT_LABELS = {
    "session": "Session (5h)",
    "weekly": "Weekly (All)",
    "sonnet_weekly": "Weekly (Sonnet)",
    "opus_weekly": "Weekly (Opus)",
    "fable_weekly": "Weekly (Fable)",
}

def format_countdown(resets_at):
    if not resets_at:
        return "No reset time"
    if isinstance(resets_at, str):
        resets_at = datetime.fromisoformat(resets_at.replace("Z", "+00:00"))
    diff = resets_at - datetime.now(timezone.utc)
    if diff.total_seconds() <= 0:
        return "Resetting..."
    hours = int(diff.total_seconds() // 3600)
    minutes = int((diff.total_seconds() % 3600) // 60)
    if hours >= 24:
        days = hours // 24
        return f"{days}d {hours % 24}h"
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"

def format_usage(account: Account, limits: dict) -> str:
    name = account.nickname or account.email or account.org_id
    lines = [f"<b>{name}</b>"]
    if account.subscription_tier:
        lines.append(f"Tier: {account.subscription_tier.replace('claude_', '').title()}")
    lines.append("")

    if not limits:
        lines.append("No usage data available yet.")
        return "\n".join(lines)

    for limit_type, data in limits.items():
        if not data:
            continue
        pct = data.get("usage_pct")
        resets_at = data.get("resets_at")
        if pct is None:
            continue
        label = LIMIT_LABELS.get(limit_type, limit_type.replace("_", " ").title())
        countdown = format_countdown(resets_at)
        bar_len = 10
        filled = int((pct / 100) * bar_len)
        bar = "█" * filled + "░" * (bar_len - filled)
        status = "🔴" if pct >= 100 else "🟡" if pct >= 80 else "🟢"
        lines.append(f"{status} {label}: {pct:.1f}% {bar} — resets in {countdown}")

    return "\n".join(lines)

async def send_safe(chat_id: str, text: str):
    try:
        ok = await send_telegram_message(chat_id, text)
        logger.info(f"send_telegram_message to {chat_id}: {'OK' if ok else 'FAILED'}")
        return ok
    except Exception as e:
        logger.exception(f"send_telegram_message to {chat_id} raised: {e}")
        return False

@router.post("/webhook")
async def telegram_webhook(request: Request, db: Session = Depends(get_sync_db)):
    try:
        payload = await request.json()
    except Exception:
        return {"ok": True}

    message = payload.get("message") or payload.get("edited_message")
    if not message:
        return {"ok": True}

    text = (message.get("text") or "").strip()
    if not text:
        return {"ok": True}

    incoming_chat_id = str(message.get("chat", {}).get("id", ""))
    logger.info(f"Webhook received: chat_id={incoming_chat_id}, text={text}")

    parts = text.split(" ", 1)
    cmd = parts[0].lower()
    arg = parts[1].strip() if len(parts) > 1 else ""

    if cmd == "note":
        if not arg:
            await send_safe(incoming_chat_id, "Usage: note <nickname> <your note text>")
            return {"ok": True}

        nickname_query, content = arg.split(" ", 1) if " " in arg else (arg, "")
        if not content:
            await send_safe(incoming_chat_id, "Usage: note <nickname> <your note text>")
            return {"ok": True}

        accounts = db.query(Account).all()
        matches = [
            a for a in accounts
            if (a.nickname and nickname_query.lower() in a.nickname.lower())
            or (a.email and nickname_query.lower() in a.email.lower())
        ]

        if len(matches) == 0:
            await send_safe(incoming_chat_id, f"No account matching '{nickname_query}' found.")
            return {"ok": True}
        if len(matches) > 1:
            names = ", ".join(a.nickname or a.email or a.org_id for a in matches)
            await send_safe(incoming_chat_id, f"Multiple accounts match '{nickname_query}': {names}. Be more specific.")
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
        await send_safe(reply_chat_id, f"✅ Note updated for {name}:\n{content}")
        return {"ok": True}

    if cmd == "usage":
        if arg:
            accounts = db.query(Account).all()
            matches = [
                a for a in accounts
                if (a.nickname and arg.lower() in a.nickname.lower())
                or (a.email and arg.lower() in a.email.lower())
            ]
            accounts_to_show = [a for a in matches if a.telegram_chat_id == incoming_chat_id]
            if not accounts_to_show:
                await send_safe(incoming_chat_id, f"No account matching '{arg}' linked to this chat.")
                return {"ok": True}
        else:
            accounts_to_show = db.query(Account).filter(Account.telegram_chat_id == incoming_chat_id).all()
            if not accounts_to_show:
                await send_safe(incoming_chat_id, "No accounts linked to this chat. Use 'usage <nickname>' or link an account in the dashboard.")
                return {"ok": True}

        for account in accounts_to_show:
            latest = db.query(SyncEvent).filter(SyncEvent.account_id == account.id).order_by(SyncEvent.timestamp.desc()).first()
            limits = latest.limits if latest else None
            note = db.query(AccountNote).filter(AccountNote.account_id == account.id).first()

            msg_text = format_usage(account, limits)
            if note and note.content:
                msg_text += f"\n\n📝 Notes:\n{note.content}"

            reply_chat_id = account.telegram_chat_id or incoming_chat_id
            await send_safe(reply_chat_id, msg_text)

        return {"ok": True}

    if cmd == "help":
        help_text = (
            "<b>UsageOS Bot Commands</b>\n\n"
            "<code>usage</code> \u2014 Show usage for accounts linked to this chat\n"
            "<code>usage nickname</code> \u2014 Show usage for specific account\n"
            "<code>note nickname text</code> \u2014 Update notes for an account\n"
            "<code>help</code> \u2014 Show this help"
        )
        await send_safe(incoming_chat_id, help_text)
        return {"ok": True}

    return {"ok": True}