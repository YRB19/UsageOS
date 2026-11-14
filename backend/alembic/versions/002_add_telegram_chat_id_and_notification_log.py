"""add telegram_chat_id to accounts

Idempotent: skips the column if it already exists.

Revision ID: 002_add_telegram_chat_id
Revises: 9d943a576938
Create Date: 2026-07-11 15:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '002_add_telegram_chat_id'
down_revision = '9d943a576938'
branch_labels = None
depends_on = None


def upgrade():
    cols = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('accounts')}
    if 'telegram_chat_id' not in cols:
        op.add_column('accounts', sa.Column('telegram_chat_id', sa.String(64), nullable=True))


def downgrade():
    op.drop_column('accounts', 'telegram_chat_id')
