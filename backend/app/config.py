from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    GEMINI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    AGENT_PROVIDER: str = "ollama"  # "ollama" | "anthropic" | "gemini"
    AGENT_MODEL: str = "qwen2.5:7b"

    class Config:
        env_file = ".env"


settings = Settings()
