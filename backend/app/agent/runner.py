import base64
import uuid
from pathlib import Path

from browser_use import Agent, BrowserProfile, BrowserSession

from app.config import settings

UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


def _build_llm():
    provider = settings.AGENT_PROVIDER
    model = settings.AGENT_MODEL

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=model or "claude-haiku-4-5-20251001",
            api_key=settings.ANTHROPIC_API_KEY,
        )
    elif provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=model or "gemini-2.0-flash",
            google_api_key=settings.GEMINI_API_KEY,
        )
    else:
        from browser_use import ChatOllama
        return ChatOllama(
            model=model or "qwen2.5:7b",
            timeout=180,  # 3 min — local models are slow
        )


async def run_agent(prompt: str) -> dict:
    llm = _build_llm()

    profile = BrowserProfile(channel="chrome", headless=False)
    browser = BrowserSession(browser_profile=profile)

    agent = Agent(task=prompt, llm=llm, browser=browser, use_vision=True)
    history = await agent.run(max_steps=15)

    final_result = history.final_result() or "Task completed"

    screenshot_url = None
    screenshots = history.screenshots()
    if screenshots:
        raw = screenshots[-1]
        if raw.startswith("data:image"):
            raw = raw.split(",", 1)[1]
        screenshot_name = f"{uuid.uuid4()}.png"
        (UPLOAD_DIR / screenshot_name).write_bytes(base64.b64decode(raw))
        screenshot_url = f"/uploads/{screenshot_name}"

    return {
        "status": "completed",
        "result": str(final_result),
        "screenshot_url": screenshot_url,
    }
