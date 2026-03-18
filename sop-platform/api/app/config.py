from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://sop_admin:dev_password_change_me@sop-postgres:5432/sop_platform"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    azure_blob_base_url: str = ""
    extractor_url: str = "http://sop-extractor:8001"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
