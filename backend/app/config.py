import os
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    database_url: str = os.getenv("DATABASE_URL", "postgresql://atlas:CHANGE_ME_PASSWORD@postgres:5432/atlas")
    atlas_api_key: str = os.getenv("ATLAS_API_KEY", "")
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    cors_origins: list[str] = ["*"]

    class Config:
        env_file = "../.env"
        case_sensitive = False

settings = Settings()