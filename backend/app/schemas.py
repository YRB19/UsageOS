from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


# ── Sync (extension → server) ─────────────────────────────────────────────────

class LimitPayload(BaseModel):
    usage_pct: Optional[float] = None
    resets_at: Optional[datetime] = None

class SyncRequest(BaseModel):
    provider:          str = "claude"
    email:             Optional[str] = None
    org_id:            Optional[str] = None
    subscription_tier: Optional[str] = None
    limits: dict[str, Optional[LimitPayload]] = Field(default_factory=dict)
    timestamp:         Optional[datetime] = None

class SyncResponse(BaseModel):
    account_id: uuid.UUID
    created:    bool


# ── Account ───────────────────────────────────────────────────────────────────

class CurrentUsageOut(BaseModel):
    limit_type: str
    usage_pct:  Optional[float]
    resets_at:  Optional[datetime]
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class AccountOut(BaseModel):
    id:                uuid.UUID
    email:             str
    org_id:            Optional[str]
    nickname:          Optional[str]
    project_name:      Optional[str]
    color:             str
    subscription_tier: Optional[str]
    is_active:         bool
    created_at:        datetime
    last_seen_at:      Optional[datetime]
    current_usage:     list[CurrentUsageOut] = []
    note:              Optional[str] = None
    # Notification preferences
    notify_telegram:   bool = False
    telegram_chat_id:  Optional[str] = None
    notify_whatsapp:   bool = False
    whatsapp_number:   Optional[str] = None
    notify_reset:      bool = True
    notify_threshold:  Optional[float] = None
    model_config = ConfigDict(from_attributes=True)

class AccountPatch(BaseModel):
    nickname:          Optional[str] = None
    project_name:      Optional[str] = None
    color:             Optional[str] = None
    is_active:         Optional[bool] = None
    notify_telegram:   Optional[bool] = None
    telegram_chat_id:  Optional[str] = None
    notify_whatsapp:   Optional[bool] = None
    whatsapp_number:   Optional[str] = None
    notify_reset:      Optional[bool] = None
    notify_threshold:  Optional[float] = None


# ── Notes ─────────────────────────────────────────────────────────────────────

class NoteOut(BaseModel):
    content:    str
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class NotePut(BaseModel):
    content: str


# ── History ───────────────────────────────────────────────────────────────────

class SnapshotOut(BaseModel):
    recorded_at: datetime
    usage_pct:   float
    resets_at:   Optional[datetime]
    model_config = ConfigDict(from_attributes=True)


# ── Dashboard ─────────────────────────────────────────────────────────────────

class DashboardAccount(BaseModel):
    id:                uuid.UUID
    email:             str
    nickname:          Optional[str]
    project_name:      Optional[str]
    color:             str
    subscription_tier: Optional[str]
    last_seen_at:      Optional[datetime]
    current_usage:     dict[str, Optional[CurrentUsageOut]]
    note:              str
    model_config = ConfigDict(from_attributes=True)

class DashboardResponse(BaseModel):
    accounts: list[DashboardAccount]


# ── Health ────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status:   str
    db:       str
    accounts: int
