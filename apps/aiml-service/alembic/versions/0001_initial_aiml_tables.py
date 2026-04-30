"""initial aiml tables

Revision ID: 0001_initial_aiml
Revises:
Create Date: 2026-05-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0001_initial_aiml"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "aiml_documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("metadata", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "aiml_audit_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("route", sa.String(length=255), nullable=False),
        sa.Column("model", sa.String(length=255), nullable=False),
        sa.Column("prompt_hash", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("tokens_in", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ok"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_aiml_audit_logs_user_id", "aiml_audit_logs", ["user_id"]
    )
    op.create_index(
        "ix_aiml_audit_logs_created_at", "aiml_audit_logs", ["created_at"]
    )

    op.create_table(
        "aiml_feedback",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("message_id", sa.String(length=255), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_aiml_feedback_message_id", "aiml_feedback", ["message_id"])
    op.create_index("ix_aiml_feedback_user_id", "aiml_feedback", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_aiml_feedback_user_id", table_name="aiml_feedback")
    op.drop_index("ix_aiml_feedback_message_id", table_name="aiml_feedback")
    op.drop_table("aiml_feedback")
    op.drop_index("ix_aiml_audit_logs_created_at", table_name="aiml_audit_logs")
    op.drop_index("ix_aiml_audit_logs_user_id", table_name="aiml_audit_logs")
    op.drop_table("aiml_audit_logs")
    op.drop_table("aiml_documents")
