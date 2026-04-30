"""Live ingestion integration test.

Skipped unless `RUN_PG_INTEGRATION=1`. When run, it spins up a Postgres
container with pgvector via testcontainers and verifies that documents
are chunked, embedded, and persisted into the LlamaIndex node table.

Embeddings are mocked at the LlamaIndex level so the test does not call
the real OpenAI API."""

from __future__ import annotations

import os
import uuid

import pytest

pytestmark = pytest.mark.integration


@pytest.mark.skipif(
    os.getenv("RUN_PG_INTEGRATION") != "1",
    reason="Set RUN_PG_INTEGRATION=1 to run pgvector integration tests",
)
async def test_ingest_persists_nodes(monkeypatch):
    from testcontainers.postgres import PostgresContainer

    with PostgresContainer("pgvector/pgvector:pg16") as pg:
        url = pg.get_connection_url().replace("psycopg2", "psycopg")
        monkeypatch.setenv("DATABASE_URL", url)

        # Reset cached Settings to pick up the new URL.
        from app.config import get_settings

        get_settings.cache_clear()

        from sqlalchemy import create_engine, text

        engine = create_engine(url)
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

        # Mock the embedding model so we don't hit OpenAI.
        from llama_index.core.settings import Settings as LISettings
        from llama_index.core.embeddings.mock_embed_model import MockEmbedding

        LISettings.embed_model = MockEmbedding(embed_dim=1536)

        from app.services.llamaindex_index import ingest_documents

        docs = [
            {"id": f"doc-{i}", "text": f"Sample document {i} " * 50, "metadata": {"i": i}}
            for i in range(5)
        ]
        result = await ingest_documents(docs)
        assert result["ingested"] == 5
        assert result["nodes"] >= 5

        with engine.begin() as conn:
            count = conn.execute(text("SELECT count(*) FROM data_document_nodes")).scalar()
            assert count >= 5
