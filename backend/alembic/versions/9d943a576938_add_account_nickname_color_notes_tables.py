"""add account nickname, color, notes tables

Revision ID: 9d943a576938
Revises: 001
Create Date: 2026-07-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, JSON

# revision identifiers, used by Alembic.
revision: str = '9d943a576938'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('sync_events', 'limits',
               existing_type=JSON(astext_type=sa.Text()),
               type_=JSONB(astext_type=sa.Text()),
               existing_nullable=False)


def downgrade() -> None:
    op.alter_column('sync_events', 'limits',
               existing_type=JSONB(astext_type=sa.Text()),
               type_=JSON(astext_type=sa.Text()),
               existing_nullable=False)