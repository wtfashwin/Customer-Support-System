from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    environment: Literal["development", "staging", "production", "test"] = "development"
    log_level: str = "INFO"
    aiml_port: int = 8000

    database_url: str = "postgresql://postgres:postgres@localhost:5432/aiml"
    redis_url: str = "redis://localhost:6379/0"

    openai_provider: Literal["openai", "azure"] = "openai"
    openai_api_key: str = ""
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    openai_chat_model: str = "gpt-4o-mini"
    openai_embed_model: str = "text-embedding-3-small"
    openai_embed_dim: int = 1536

    azure_di_endpoint: str = ""
    azure_di_key: str = ""
    azure_search_endpoint: str = ""
    azure_search_key: str = ""
    azure_search_index: str = "customer-support"

    auth0_domain: str = ""
    auth0_audience: str = ""

    otel_exporter_otlp_endpoint: str = ""

    cache_ttl_seconds: int = 60 * 60 * 24
    embed_max_items: int = 256
    embed_max_chars: int = 8192
    ingest_max_documents: int = 100
    document_max_bytes: int = 20 * 1024 * 1024

    @property
    def async_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgresql+asyncpg://"):
            return url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url

    @property
    def sync_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgresql+asyncpg://"):
            return url.replace("postgresql+asyncpg://", "postgresql://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql://", 1)
        return url

    @property
    def auth0_issuer(self) -> str:
        domain = self.auth0_domain.rstrip("/")
        return f"https://{domain}/" if domain else ""

    @property
    def jwks_url(self) -> str:
        domain = self.auth0_domain.rstrip("/")
        return f"https://{domain}/.well-known/jwks.json" if domain else ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
