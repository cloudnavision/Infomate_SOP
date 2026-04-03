from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = ""
    # CORS — set via env var, must be valid JSON array: ["http://localhost:5173"]
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    # Azure
    azure_blob_base_url: str = ""
    azure_blob_sas_token: str = ""
    # Services
    extractor_url: str = "http://sop-extractor:8001"
    n8n_webhook_base_url: str = ""
    # Supabase auth — URL used to derive JWKS endpoint
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    # Pipeline security — shared secret between n8n and this API
    # n8n sends header: x-internal-key: <this value>
    # Generate: python -c "import secrets; print(secrets.token_hex(32))"
    internal_api_key: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
