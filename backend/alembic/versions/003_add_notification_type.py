"""add notification_type to notification_log

Revision ID: 003_add_notification_type
Revises: 002_add_telegram_chat_id
Create Date: 2026-07-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003_add_notification_type'
down_revision = '002_add_telegram_chat_id'
branch_labels = None
depends_on = None


def upgrade():
    # Add notification_type column to notification_log
    op.add_column('notification_log', sa.Column('notification_type', sa.String(20), nullable=False, server_default='pre_reset'))
    
    # Drop the old unique index
    op.drop_index('ix_notification_log_account_limit', table_name='notification_log')
    
    # Create new unique index including notification_type
    op.create_index(
        'ix_notification_log_account_limit_type',
        'notification_log',
        ['account_id', 'limit_type', 'resets_at', 'notification_type'],
        unique=True
    )


def downgrade():
    # Drop the new unique index
    op.drop_index('ix_notification_log_account_limit_type', table_name='notification_log')
    
    # Recreate the old unique index
    op.create_index(
        'ix_notification_log_account_limit',
        'notification_log',
        ['account_id', 'limit_type', 'resets_at'],
        unique=True
    )
    
    # Drop the notification_type column
    op.drop_column('notification_log', 'notification_type')