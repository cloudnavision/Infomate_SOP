from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase transaction pooler — port 6543, not 5432
    database_url: str = "postgresql+asyncpg://postgres.xxxxx:password@aws-0-region.pooler.supabase.com:6543/postgres"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    azure_blob_base_url: str = ""
    extractor_url: str = "http://sop-extractor:8001"
    n8n_webhook_base_url: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
