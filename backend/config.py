"""
config.py — Application configuration loaded from environment variables.

GROQ_API_KEY is required.  The server will refuse to start without it.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── LLM provider ──────────────────────────────────────────────────────────
    # GROQ_API_KEY must be set in your environment or .env file.
    groq_api_key: str = ""

    # Base URL for the Groq OpenAI-compatible endpoint.
    llm_base_url: str = "https://api.groq.com/openai/v1"

    # Model name to request from Groq.
    llm_model: str = "qwen/qwen3.8-27b"

    # ── Behaviour ─────────────────────────────────────────────────────────────
    # Maximum PDF file size accepted by the API (bytes).  Default = 10 MB.
    max_file_size_bytes: int = 10 * 1024 * 1024

    # HTTP timeout for LLM requests (seconds).
    llm_timeout_s: float = 60.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def validate_api_key(self) -> None:
        """Raise a RuntimeError if GROQ_API_KEY is not configured."""
        if not self.groq_api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set. "
                "Please add it to your .env file or environment variables before starting the server."
            )


# Singleton — import this everywhere.
settings = Settings()
