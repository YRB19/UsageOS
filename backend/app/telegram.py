import httpx
from app.config import settings

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"

async def send_telegram_message(chat_id: str, text: str) -> bool:
    if not settings.telegram_bot_token or not chat_id:
        return False
    url = TELEGRAM_API.format(token=settings.telegram_bot_token, method="sendMessage")
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
        })
        return resp.status_code == 200