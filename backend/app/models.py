import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, Boolean, Text, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── providers ─────────────────────────────────────────────────────────────────

class Provider(Base):
    __tablename__ = "providers"

    id:           Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug:         Mapped[str]        = mapped_column(String(64), unique=True, nullable=False)   # 'claude', 'openai'
    display_name: Mapped[str]        = mapped_column(String(128), nullable=False)
    created_at:   Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow)

    accounts:     Mapped[list["Account"]] = relationship(back_populates="provider")


# ── accounts ──────────────────────────────────────────────────────────────────

class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (UniqueConstraint("provider_id", "email", name="uq_provider_email"),)

    id:                Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider_id:       Mapped[uuid.UUID]       = mapped_column(ForeignKey("providers.id"), nullable=False)
    email:             Mapped[str]             = mapped_column(String(320), nullable=False)
    org_id:            Mapped[str | None]      = mapped_column(String(128))
    nickname:          Mapped[str | None]      = mapped_column(String(128))
    project_name:      Mapped[str | None]      = mapped_column(String(256))
    color:             Mapped[str]             = mapped_column(String(32), default="#d97757")
    subscription_tier: Mapped[str | None]      = mapped_column(String(64))
    is_active:         Mapped[bool]            = mapped_column(Boolean, default=True)
    created_at:        Mapped[datetime]        = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at:      Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    provider:          Mapped["Provider"]           = relationship(back_populates="accounts")
    snapshots:         Mapped[list["UsageSnapshot"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    current_usage:     Mapped[list["CurrentUsage"]]  = relationship(back_populates="account", cascade="all, delete-orphan")
    note:              Mapped["AccountNote | None"]  = relationship(back_populates="account", cascade="all, delete-orphan", uselist=False)


# ── usage_snapshots ───────────────────────────────────────────────────────────

class UsageSnapshot(Base):
    """Append-only time-series record of usage at a point in time."""
    __tablename__ = "usage_snapshots"

    id:          Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id:  Mapped[uuid.UUID]       = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    limit_type:  Mapped[str]             = mapped_column(String(64), nullable=False)   # 'session' | 'weekly' | …
    usage_pct:   Mapped[float]           = mapped_column(Float, nullable=False)
    resets_at:   Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime]        = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    source:      Mapped[str]             = mapped_column(String(32), default="extension")

    account:     Mapped["Account"]       = relationship(back_populates="snapshots")


# ── current_usage ─────────────────────────────────────────────────────────────

class CurrentUsage(Base):
    """
    Materialised latest state — one row per (account_id, limit_type).
    Updated via UPSERT on every sync call. Keeps dashboard reads O(1).
    """
    __tablename__ = "current_usage"

    account_id:  Mapped[uuid.UUID]       = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True)
    limit_type:  Mapped[str]             = mapped_column(String(64), primary_key=True)
    usage_pct:   Mapped[float | None]    = mapped_column(Float)
    resets_at:   Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at:  Mapped[datetime]        = mapped_column(DateTime(timezone=True), default=utcnow)

    account:     Mapped["Account"]       = relationship(back_populates="current_usage")


# ── account_notes ─────────────────────────────────────────────────────────────

class AccountNote(Base):
    __tablename__ = "account_notes"

    id:         Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), unique=True, nullable=False)
    content:    Mapped[str]       = mapped_column(Text, default="")
    updated_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=utcnow)

    account:    Mapped["Account"] = relationship(back_populates="note")
