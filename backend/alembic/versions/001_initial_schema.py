"""initial schema

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('providers',
        sa.Column('id',           UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('slug',         sa.String(64),  nullable=False, unique=True),
        sa.Column('display_name', sa.String(128), nullable=False),
        sa.Column('created_at',   sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    op.create_table('accounts',
        sa.Column('id',                UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('provider_id',       UUID(as_uuid=True), sa.ForeignKey('providers.id'), nullable=False),
        sa.Column('email',             sa.String(320), nullable=False),
        sa.Column('org_id',            sa.String(128)),
        sa.Column('nickname',          sa.String(128)),
        sa.Column('project_name',      sa.String(256)),
        sa.Column('color',             sa.String(32),  server_default="'#d97757'"),
        sa.Column('subscription_tier', sa.String(64)),
        sa.Column('is_active',         sa.Boolean,     server_default='true'),
        sa.Column('created_at',        sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('last_seen_at',      sa.DateTime(timezone=True)),
        sa.UniqueConstraint('provider_id', 'email', name='uq_provider_email'),
    )

    op.create_table('usage_snapshots',
        sa.Column('id',          UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('account_id',  UUID(as_uuid=True), sa.ForeignKey('accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('limit_type',  sa.String(64),  nullable=False),
        sa.Column('usage_pct',   sa.Float,       nullable=False),
        sa.Column('resets_at',   sa.DateTime(timezone=True)),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), index=True),
        sa.Column('source',      sa.String(32),  server_default="'extension'"),
    )
    op.create_index('idx_snapshots_account_recent', 'usage_snapshots', ['account_id', 'recorded_at'])

    op.create_table('current_usage',
        sa.Column('account_id',  UUID(as_uuid=True), sa.ForeignKey('accounts.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('limit_type',  sa.String(64), primary_key=True),
        sa.Column('usage_pct',   sa.Float),
        sa.Column('resets_at',   sa.DateTime(timezone=True)),
        sa.Column('updated_at',  sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    op.create_table('account_notes',
        sa.Column('id',         UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('accounts.id', ondelete='CASCADE'), unique=True, nullable=False),
        sa.Column('content',    sa.Text, server_default="''"),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    # Seed Claude provider
    op.execute("INSERT INTO providers (slug, display_name) VALUES ('claude', 'Claude')")


def downgrade():
    op.drop_table('account_notes')
    op.drop_table('current_usage')
    op.drop_index('idx_snapshots_account_recent', 'usage_snapshots')
    op.drop_table('usage_snapshots')
    op.drop_table('accounts')
    op.drop_table('providers')
