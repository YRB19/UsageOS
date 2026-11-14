"""store sync_events.limits as JSONB

(The file name is historical; nickname, color and notes were already part of 001.)
Idempotent: does nothing if the column is already JSONB.

Revision ID: 9d943a576938
Revises: 001
Create Date: 2026-07-11 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, JSON

revision: str = '9d943a576938'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_jsonb() -> bool:
    cols = sa.inspect(op.get_bind()).get_columns('sync_events')
    return any(c['name'] == 'limits' and isinstance(c['type'], JSONB) for c in cols)


def upgrade() -> None:
    if _is_jsonb():
        return
    op.alter_column('sync_events', 'limits',
                    existing_type=JSON(astext_type=sa.Text()),
                    type_=JSONB(astext_type=sa.Text()),
                    postgresql_using='limits::jsonb',
                    existing_nullable=False)


def downgrade() -> None:
    op.alter_column('sync_events', 'limits',
                    existing_type=JSONB(astext_type=sa.Text()),
                    type_=JSON(astext_type=sa.Text()),
                    postgresql_using='limits::json',
                    existing_nullable=False)
