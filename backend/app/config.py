import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = os.getenv("DATABASE_URL", "")
    server_api_key: str = os.getenv("SERVER_API_KEY", "")
    # Password typed once per device on the dashboard login screen.
    # Falls back to SERVER_API_KEY when not set.
    dashboard_password: str = os.getenv("DASHBOARD_PASSWORD", "")
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    # Shared secret Telegram sends back in the X-Telegram-Bot-Api-Secret-Token header.
    # Must be set (and passed to setWebhook) for the webhook to accept anything.
    telegram_webhook_secret: str = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
    cors_origins: list[str] = ["*"]

    class Config:
        env_file = "../.env"
        case_sensitive = False


settings = Settings()
