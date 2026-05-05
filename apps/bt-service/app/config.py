"""Configuration loaded from environment variables."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Service
    environment: str = Field(default="development", description="dev/staging/production")
    log_level: str = "INFO"
    port: int = 8000

    # Auth — token the Next.js app uses to call this service
    internal_api_token: str = Field(
        ...,
        description="Shared secret between web app and bt-service. "
                    "Required on every request via X-Internal-Token header.",
    )

    # Database
    database_url: str = Field(
        ...,
        description="Postgres connection string, e.g. postgresql+asyncpg://...",
    )

    # Encryption key for storing BT session cookies at rest
    session_encryption_key: str = Field(
        ...,
        description="Fernet key for encrypting BT session cookies in DB. "
                    "Generate with: python -c 'from cryptography.fernet import Fernet; "
                    "print(Fernet.generate_key().decode())'",
    )

    # Buildertrend
    bt_base_url: str = "https://buildertrend.net"
    bt_user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/147.0.0.0 Safari/537.36"
    )
    bt_builder_id: int = Field(..., description="Your tenant's builder ID")

    # Rate limiting (requests per minute to BT)
    bt_rate_limit_per_minute: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
