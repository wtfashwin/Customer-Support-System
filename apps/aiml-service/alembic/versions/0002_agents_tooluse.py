"""agents + tool use schema

Revision ID: 0002_agents_tooluse
Revises: 0001_initial_aiml
Create Date: 2026-05-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0002_agents_tooluse"
down_revision: Union[str, None] = "0001_initial_aiml"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "aiml_conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("metadata", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_aiml_conv_user_created",
        "aiml_conversations",
        ["user_id", sa.text("created_at DESC")],
    )

    op.create_table(
        "aiml_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "conversation_id",
            UUID(as_uuid=True),
            sa.ForeignKey("aiml_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tool_calls", JSONB(), nullable=True),
        sa.Column("tool_results", JSONB(), nullable=True),
        sa.Column("tokens_in", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_aiml_msg_conv_created",
        "aiml_messages",
        ["conversation_id", "created_at"],
    )

    op.create_table(
        "aiml_tickets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "conversation_id",
            UUID(as_uuid=True),
            sa.ForeignKey("aiml_conversations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="normal"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_aiml_tickets_user_status",
        "aiml_tickets",
        ["user_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_aiml_tickets_user_status", table_name="aiml_tickets")
    op.drop_table("aiml_tickets")
    op.drop_index("ix_aiml_msg_conv_created", table_name="aiml_messages")
    op.drop_table("aiml_messages")
    op.drop_index("ix_aiml_conv_user_created", table_name="aiml_conversations")
    op.drop_table("aiml_conversations")
