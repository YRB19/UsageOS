"""initial_schema

Idempotent: creates each table only if it is missing, so the same chain works on a
brand-new database AND on a database that older versions of UsageOS created with
Base.metadata.create_all().

Revision ID: 001
Revises:
Create Date: 2026-07-11 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    existing = _tables()

    if 'accounts' not in existing:
        op.create_table(
            'accounts',
            sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('provider', sa.String(32), nullable=False, server_default='claude'),
            sa.Column('email', sa.String(255), nullable=True),
            sa.Column('org_id', sa.String(128), nullable=False, unique=True, index=True),
            sa.Column('nickname', sa.String(255), nullable=True),
            sa.Column('color', sa.String(7), nullable=False, server_default='#d97757'),
            sa.Column('subscription_tier', sa.String(64), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        )

    if 'sync_events' not in existing:
        op.create_table(
            'sync_events',
            sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('email', sa.String(255), nullable=True),
            sa.Column('org_id', sa.String(128), nullable=False, index=True),
            sa.Column('subscription_tier', sa.String(64), nullable=True),
            sa.Column('limits', sa.JSON(), nullable=False),
            sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        )
        op.create_index('ix_sync_events_org_timestamp', 'sync_events', ['org_id', 'timestamp'])

    if 'account_notes' not in existing:
        op.create_table(
            'account_notes',
            sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('accounts.id', ondelete='CASCADE'), unique=True, nullable=False),
            sa.Column('content', sa.Text, server_default="''"),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        )

    if 'settings' not in existing:
        op.create_table(
            'settings',
            sa.Column('key', sa.String(64), primary_key=True),
            sa.Column('value', sa.Text, nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        )

    # Earlier versions never migrated this table (it only existed via create_all),
    # which is what broke migration 003 on empty databases.
    if 'notification_log' not in existing:
        op.create_table(
            'notification_log',
            sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('limit_type', sa.String(64), nullable=False),
            sa.Column('resets_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('notified_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        )
        op.create_index('ix_notification_log_account_limit', 'notification_log',
                        ['account_id', 'limit_type', 'resets_at'], unique=True)


def downgrade() -> None:
    op.drop_table('notification_log')
    op.drop_table('settings')
    op.drop_table('account_notes')
    op.drop_table('sync_events')
    op.drop_table('accounts')
