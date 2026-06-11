from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    GEMINI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    AGENT_PROVIDER: str = "ollama"  # "ollama" | "anthropic" | "gemini" | "azure"
    AGENT_MODEL: str = "qwen2.5:7b"

    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_DEPLOYMENT: str = ""
    AZURE_OPENAI_API_VERSION: str = "2024-10-21"

    # Which browser channel the agent drives. Allowed values (from Playwright):
    #   "chrome"     — system Google Chrome (default; corporate-approved at most orgs)
    #   "msedge"     — system Microsoft Edge (Chromium-engine, almost always approved)
    #   "chromium"   — Playwright-bundled Chromium (open-source; often what is banned)
    #   "chrome-beta", "chrome-dev", "msedge-beta", "msedge-dev" — beta channels
    # Note: Firefox / Safari / WebKit are NOT supported by browser-use.
    BROWSER_CHANNEL: str = "chrome"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
