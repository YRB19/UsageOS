"""initial_schema

Revision ID: 001
Revises: 
Create Date: 2026-07-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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

    op.create_table(
        'account_notes',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('accounts.id', ondelete='CASCADE'), unique=True, nullable=False),
        sa.Column('content', sa.Text, server_default="''"),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    op.create_table(
        'settings',
        sa.Column('key', sa.String(64), primary_key=True),
        sa.Column('value', sa.Text, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )


def downgrade() -> None:
    op.drop_table('settings')
    op.drop_table('account_notes')
    op.drop_table('sync_events')
    op.drop_table('accounts')