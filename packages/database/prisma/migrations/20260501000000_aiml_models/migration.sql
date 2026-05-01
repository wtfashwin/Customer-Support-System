-- AIML service tables: aiml_documents, aiml_feedback, aiml_audit_logs.
--
-- These are also created by the Python apps/aiml-service Alembic migration
-- (alembic/versions/0001_initial_aiml_tables.py). To make Prisma's deploy
-- step idempotent against environments where Alembic ran first, we use
-- IF NOT EXISTS everywhere. The pgvector `embedding` column on
-- aiml_documents is included here because Prisma 6 does not model
-- vector(N) natively.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "aiml_documents" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding" vector(1536),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "aiml_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "aiml_feedback" (
    "id" UUID NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "aiml_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ix_aiml_feedback_message_id" ON "aiml_feedback"("message_id");
CREATE INDEX IF NOT EXISTS "ix_aiml_feedback_user_id" ON "aiml_feedback"("user_id");

CREATE TABLE IF NOT EXISTS "aiml_audit_logs" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_hash" TEXT NOT NULL DEFAULT '',
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,6),
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "aiml_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ix_aiml_audit_logs_user_created" ON "aiml_audit_logs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_aiml_audit_logs_created_at" ON "aiml_audit_logs"("created_at");
