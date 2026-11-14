"""add notification_type to notification_log

Idempotent: every step checks current state first.

Revision ID: 003_add_notification_type
Revises: 002_add_telegram_chat_id
Create Date: 2026-07-12 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '003_add_notification_type'
down_revision = '002_add_telegram_chat_id'
branch_labels = None
depends_on = None

NEW_INDEX = 'ix_notification_log_account_limit_type'
OLD_INDEX = 'ix_notification_log_account_limit'


def upgrade():
    insp = sa.inspect(op.get_bind())
    cols = {c['name'] for c in insp.get_columns('notification_log')}
    indexes = {i['name'] for i in insp.get_indexes('notification_log')}

    if 'notification_type' not in cols:
        op.add_column('notification_log', sa.Column(
            'notification_type', sa.String(20), nullable=False, server_default='pre_reset'))
    if OLD_INDEX in indexes:
        op.drop_index(OLD_INDEX, table_name='notification_log')
    if NEW_INDEX not in indexes:
        op.create_index(NEW_INDEX, 'notification_log',
                        ['account_id', 'limit_type', 'resets_at', 'notification_type'], unique=True)


def downgrade():
    op.drop_index(NEW_INDEX, table_name='notification_log')
    op.create_index(OLD_INDEX, 'notification_log', ['account_id', 'limit_type', 'resets_at'], unique=True)
    op.drop_column('notification_log', 'notification_type')
