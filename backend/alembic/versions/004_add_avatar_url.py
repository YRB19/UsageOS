"""add avatar_url to accounts

Idempotent: skips the column if it already exists.

Revision ID: 004_add_avatar_url
Revises: 003_add_notification_type
Create Date: 2026-07-12 18:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '004_add_avatar_url'
down_revision = '003_add_notification_type'
branch_labels = None
depends_on = None


def upgrade():
    cols = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('accounts')}
    if 'avatar_url' not in cols:
        op.add_column('accounts', sa.Column('avatar_url', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('accounts', 'avatar_url')
