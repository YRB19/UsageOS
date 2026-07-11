from sqlalchemy import Column, String, Integer, DateTime, Text, Boolean, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.sql import func
import uuid
from app.database import Base

class Account(Base):
    __tablename__ = "accounts"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider = Column(String(32), nullable=False, default="claude")
    email = Column(String(255), nullable=True)
    org_id = Column(String(128), nullable=False, unique=True, index=True)
    nickname = Column(String(255), nullable=True)
    color = Column(String(7), nullable=False, default="#6366f1")
    telegram_chat_id = Column(String(64), nullable=True)
    subscription_tier = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class SyncEvent(Base):
    __tablename__ = "sync_events"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=True)
    org_id = Column(String(128), nullable=False, index=True)
    subscription_tier = Column(String(64), nullable=True)
    limits = Column(JSONB, nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_sync_events_org_timestamp", "org_id", "timestamp"),)

class AccountNote(Base):
    __tablename__ = "account_notes"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), unique=True, nullable=False)
    content = Column(Text, server_default="''")
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

class Setting(Base):
    __tablename__ = "settings"
    key = Column(String(64), primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class NotificationLog(Base):
    __tablename__ = "notification_log"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    limit_type = Column(String(64), nullable=False)
    resets_at = Column(DateTime(timezone=True), nullable=False)
    notified_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_notification_log_account_limit", "account_id", "limit_type", "resets_at", unique=True),
    )