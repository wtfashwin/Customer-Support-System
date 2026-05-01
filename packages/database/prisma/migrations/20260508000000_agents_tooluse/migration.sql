-- Agentic workflow tables: aiml_conversations, aiml_messages, aiml_tickets.
--
-- These are also created by the Python apps/aiml-service Alembic migration
-- 0002_agents_tooluse.py. Both creators use IF NOT EXISTS so deploy order
-- between Prisma and Alembic is irrelevant.

CREATE TABLE IF NOT EXISTS "aiml_conversations" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(500),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "aiml_conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ix_aiml_conv_user_created"
    ON "aiml_conversations"("user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "aiml_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" VARCHAR(32) NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "tool_results" JSONB,
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "aiml_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "aiml_messages_conversation_id_fkey"
        FOREIGN KEY ("conversation_id")
        REFERENCES "aiml_conversations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ix_aiml_msg_conv_created"
    ON "aiml_messages"("conversation_id", "created_at");

CREATE TABLE IF NOT EXISTS "aiml_tickets" (
    "id" UUID NOT NULL,
    "conversation_id" UUID,
    "user_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "priority" VARCHAR(16) NOT NULL DEFAULT 'normal',
    "status" VARCHAR(32) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "aiml_tickets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "aiml_tickets_conversation_id_fkey"
        FOREIGN KEY ("conversation_id")
        REFERENCES "aiml_conversations"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ix_aiml_tickets_user_status"
    ON "aiml_tickets"("user_id", "status");
