from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from uuid import UUID

class LimitSchema(BaseModel):
    usage_pct: Optional[float] = None
    resets_at: Optional[datetime] = None

class LimitsSchema(BaseModel):
    session: Optional[LimitSchema] = None
    weekly: Optional[LimitSchema] = None
    sonnet_weekly: Optional[LimitSchema] = None
    opus_weekly: Optional[LimitSchema] = None

class SyncPayload(BaseModel):
    provider: str
    email: Optional[str] = None
    org_id: str
    subscription_tier: Optional[str] = None
    limits: LimitsSchema
    timestamp: datetime

class SyncResponse(BaseModel):
    account_id: UUID
    model_config = ConfigDict(from_attributes=True)

class SyncEventOut(BaseModel):
    id: UUID
    org_id: str
    email: Optional[str] = None
    subscription_tier: Optional[str] = None
    limits: LimitsSchema
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)

class HealthResponse(BaseModel):
    status: str = "ok"
    model_config = ConfigDict(from_attributes=True)

class AccountOut(BaseModel):
    id: UUID
    provider: str
    email: Optional[str] = None
    org_id: str
    nickname: Optional[str] = None
    color: str
    telegram_chat_id: Optional[str] = None
    subscription_tier: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class AccountWithUsage(BaseModel):
    id: UUID
    provider: str
    email: Optional[str] = None
    org_id: str
    nickname: Optional[str] = None
    color: str
    telegram_chat_id: Optional[str] = None
    subscription_tier: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime
    limits: list[dict] = []
    model_config = ConfigDict(from_attributes=True)

class AccountPatch(BaseModel):
    nickname: Optional[str] = None
    color: Optional[str] = None
    telegram_chat_id: Optional[str] = None

class SettingIn(BaseModel):
    key: str
    value: str

class SettingOut(BaseModel):
    key: str
    value: str
    model_config = ConfigDict(from_attributes=True)

class NoteIn(BaseModel):
    content: str

class NoteOut(BaseModel):
    content: str
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)