# Stage 08 — AI Agent Layer (Phase 6) ✅

This stage adds the AI agent capability. An LLM controls a real Chrome browser, navigates
cloud portals, takes screenshots, and returns them as evidence — driven by a natural language prompt.

**Status: Implemented.** All files described here exist in the codebase.

---

## 1. What Is `browser-use`?

`browser-use` is a Python library that creates an agentic loop between a Large Language Model
and a real web browser controlled by Playwright.

### The Agentic Loop

```
1. Take screenshot of the current browser page
2. Extract the page's DOM as structured text
3. Send both to the LLM: "Here is what the page looks like. What should I do next?"
4. LLM returns one of:
     navigate(url)              → go to this URL
     click(element_index)       → click element #5
     input(element_index, text) → type this text into a field
     scroll(direction)          → scroll the page
     done(result)               → task is complete, return this result
5. Execute the action via Playwright
6. Go back to step 1
```

This continues until the LLM calls `done()` or `max_steps` is reached.

The key insight: **you don't write specific Playwright scripts for each portal**.
You give the LLM a goal in English and it figures out the steps by looking at the page.

---

## 2. Packages Installed

```bash
cd backend
source venv/bin/activate

pip install browser-use playwright
python -m playwright install chromium

# LLM providers (install the ones you need):
pip install langchain-google-genai   # Google Gemini
pip install langchain-anthropic      # Anthropic Claude
pip install langchain-ollama         # Ollama (local)
```

The agent uses **system Chrome** (`channel="chrome"`) rather than Playwright's downloaded
Chromium. This avoids macOS Gatekeeper issues and lets the agent reuse your existing
browser sessions (logged-in cookies, saved passwords).

---

## 3. `app/config.py` — LLM Provider Config

```python
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
```

Switch providers by editing `backend/.env`:
```
AGENT_PROVIDER=gemini
AGENT_MODEL=gemini-2.0-flash
GEMINI_API_KEY=your_key_here
```

No code changes required — `runner.py` reads these at startup.

---

## 4. `app/agent/runner.py` — Core Agent Execution

```python
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
        return ChatOllama(model=model or "qwen2.5:7b")


async def run_agent(prompt: str) -> dict:
    llm = _build_llm()

    profile = BrowserProfile(channel="chrome", headless=False)
    browser = BrowserSession(browser_profile=profile)

    agent = Agent(task=prompt, llm=llm, browser=browser)
    history = await agent.run(max_steps=15)

    final_result = history.final_result() or "Task completed"

    screenshot_url = None
    try:
        page = await browser.get_current_page()
        screenshot_bytes = await page.screenshot()
        screenshot_name = f"{uuid.uuid4()}.png"
        screenshot_path = UPLOAD_DIR / screenshot_name
        screenshot_path.write_bytes(screenshot_bytes)
        screenshot_url = f"/uploads/{screenshot_name}"
    except Exception:
        pass

    return {
        "status": "completed",
        "result": str(final_result),
        "screenshot_url": screenshot_url,
    }
```

**Key design decisions:**

| Decision | Reason |
|---|---|
| `channel="chrome"` | Uses system Chrome; avoids macOS Gatekeeper blocking Playwright's Chromium |
| `headless=False` | Visible browser — lets you watch the agent work and reuse logged-in sessions |
| `max_steps=15` | Caps runaway agents; increase for complex multi-page tasks |
| `_build_llm()` reads from settings | Swap providers via `.env` with no code changes |
| Screenshot via `browser.get_current_page()` | Captures the final page state after the agent finishes |

---

## 5. `app/api/routes/agent.py` — FastAPI Route

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agent.runner import run_agent

router = APIRouter(prefix="/agent", tags=["Agent"])


class AgentRequest(BaseModel):
    prompt: str


@router.post("/run")
async def run_agent_task(request: AgentRequest):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
    result = await run_agent(request.prompt)
    return result
```

The route is `async def` because `run_agent` is async — it must `await` the browser agent.
FastAPI runs async handlers on the event loop, so other requests aren't blocked while the
agent executes (which typically takes 30–120 seconds).

---

## 6. Registered in `app/main.py`

```python
from app.api.routes import frameworks, controls, evidence, submissions, agent

app.include_router(agent.router, prefix="/api")
```

This registers `POST /api/agent/run`.

---

## 7. Frontend — `src/api/client.ts`

```typescript
export const agentApi = {
  run: (prompt: string) =>
    api.post("/agent/run", { prompt }).then((r) => r.data),
};
```

---

## 8. Frontend — `src/pages/AgentRunner.tsx`

The page manages four states:

| State | What the user sees |
|---|---|
| `idle` | Empty form, "Run Agent" button |
| `running` | Button disabled, "Agent is navigating…" message |
| `done` | Result text + screenshot image |
| `error` | Red error box with the backend's error detail |

On submit it calls `agentApi.run(prompt)`, waits for the response, then populates
`result` and `screenshotUrl` from `data.result` and `data.screenshot_url`.

---

## 9. Database Seed Script — `app/seed.py`

Before testing the full UI, populate the database with real compliance controls:

```bash
cd backend
source venv/bin/activate
python -m app.seed
```

This inserts:
- **SOC2** — 12 controls (CC6.1, CC6.2, CC7.1, CC8.1, ...)
- **PCI-DSS** — 14 controls (Req 1.1, Req 8.2, Req 10.1, ...)
- **HIPAA** — 12 controls (§164.308(a)(1), §164.312(a)(1), ...)

The seed script checks `if db.query(Framework).count() > 0` before inserting,
so it is safe to run multiple times.

---

## 10. Test the Agent

### Via Swagger

```
POST http://localhost:8000/api/agent/run
{
  "prompt": "Go to https://aws.amazon.com/compliance/services-in-scope/ and take a screenshot"
}
```

### Via the UI

Go to `http://localhost:5173/agent`, type a prompt, click **Run Agent**.
Wait 30–120 seconds. The result text and screenshot appear when done.

### Recommended test prompts

**Quick (no login needed):**
```
Go to https://portal.azure.com and take a screenshot of the login page
```

**Compliance-relevant public page:**
```
Go to https://aws.amazon.com/compliance/services-in-scope/, scroll to find
SOC 2 in the table, and take a screenshot showing the services in scope
```

**Full portal (requires logged-in Chrome session):**
```
Go to https://portal.azure.com, navigate to Microsoft Entra ID,
open the Users section, take a screenshot of the users list
```

---

## 11. LLM Provider Comparison

| Provider | Model | Cost | Reliability |
|---|---|---|---|
| Ollama — qwen2.5:7b | local | Free | Medium — tends to loop or mis-navigate |
| Google Gemini | gemini-2.0-flash | Free tier | High |
| Anthropic Claude | claude-haiku-4-5-20251001 | Paid | Very High |

**For getting started:** Use Gemini 2.0 Flash. Free API key at `aistudio.google.com`.
Set `AGENT_PROVIDER=gemini` and `GEMINI_API_KEY=your_key` in `backend/.env`.

**Ollama** works but smaller models (7B) often lose track of the task on complex pages.
Use it for simple single-page prompts.

---

## 12. Known Limitations

### Screenshot returns `null`
If the browser session closes before the screenshot is captured,
`browser.get_current_page()` fails silently and `screenshot_url` is `null`.
This can happen on complex pages that trigger browser restarts. The `result` text
is still returned — only the screenshot is missing.

### Azure portal login errors (Code 50058)
Azure Portal redirects unauthenticated sessions to a Microsoft login page.
The agent can navigate there but cannot log in without credentials.
**Fix:** Log into Azure in your system Chrome before running the agent.
The agent will reuse your active session.

### MFA-gated portals
The agent cannot complete MFA prompts automatically. Pre-authenticate in Chrome
before running prompts against protected portals.

### Timeout on slow portals
Azure / AWS portals load slowly. If the agent times out, increase `max_steps` in
`runner.py` or break the task into smaller prompts.

---

## 13. Future Roadmap

| Feature | Priority |
|---|---|
| Azure Blob Storage swap-in (replace `local_storage.py`) | High |
| User authentication — JWT login tied to WSO2 SSO | High |
| Background task queue — agent runs don't block HTTP | Medium |
| WebSocket streaming — real-time agent logs in the UI | Medium |
| Credential injection for portal login | Low |
