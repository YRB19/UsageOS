"""add avatar_url to accounts

Revision ID: 004_add_avatar_url
Revises: 003_add_notification_type
Create Date: 2026-07-12 18:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '004_add_avatar_url'
down_revision = '003_add_notification_type'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('accounts', sa.Column('avatar_url', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('accounts', 'avatar_url')
