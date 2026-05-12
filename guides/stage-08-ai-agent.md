# Stage 08 — AI Agent Layer (Phase 6)

This stage adds the AI agent capability. An LLM controls a real Chrome browser, navigates to
cloud portals, takes screenshots, and saves them as evidence — all from a natural language prompt.

This stage has **not been implemented yet** in the current codebase.
The `AgentRunner.tsx` frontend page has a placeholder. This guide tells you exactly what to build.

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
     screenshot()               → capture and save this page
     done(result)               → task is complete, return this result
5. Execute the action via Playwright
6. Go back to step 1
```

This continues until the LLM calls `done()` or a max number of steps is reached.

The key insight: **you don't write specific Playwright scripts for each portal**.
You give the LLM a goal in English and it figures out the steps by looking at the page.

---

## 2. Install Required Packages

```bash
cd backend
source venv/bin/activate

pip install browser-use playwright
python -m playwright install chromium
```

**What each command does:**

- `pip install browser-use` — installs the browser-use library and its dependencies
  (includes langchain LLM integrations)
- `pip install playwright` — installs the Playwright browser automation library
- `python -m playwright install chromium` — downloads the Chromium browser binaries

**Also install an LLM provider. Choose one:**

```bash
# Option A: Google Gemini (free tier available)
pip install langchain-google-genai

# Option B: Anthropic Claude (paid API)
pip install langchain-anthropic

# Option C: Ollama (free, runs locally — no API key)
pip install langchain-ollama
# Then download a model:
ollama pull qwen2.5:7b
```

**Update `backend/.env` with your API key:**

For Gemini:
```
DATABASE_URL=sqlite:///./compliance.db
GEMINI_API_KEY=your_gemini_key_here
```

For Anthropic:
```
DATABASE_URL=sqlite:///./compliance.db
ANTHROPIC_API_KEY=your_anthropic_key_here
```

For Ollama: no API key needed — Ollama runs locally on your machine.

---

## 3. Update `app/config.py`

Add the API key fields so they're readable throughout the app:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    GEMINI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None

    class Config:
        env_file = ".env"


settings = Settings()
```

- `str | None = None` — optional fields with a default of None
- If you don't set these in `.env`, they're `None` and the app still starts

---

## 4. Create `backend/app/agent/` Package

```bash
mkdir -p backend/app/agent
touch backend/app/agent/__init__.py
```

---

## 5. Create `backend/app/agent/runner.py`

This file contains the core agent execution function.

```python
import asyncio
import base64
from pathlib import Path
from browser_use import Agent, BrowserSession, BrowserProfile
from app.config import settings
from app.storage.local_storage import UPLOAD_DIR


def _create_llm(provider: str = "gemini"):
    """Return an LLM instance based on provider name."""
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            api_key=settings.GEMINI_API_KEY,
        )
    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model="claude-sonnet-4-6",
            api_key=settings.ANTHROPIC_API_KEY,
        )
    elif provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(model="qwen2.5:7b")
    else:
        raise ValueError(f"Unknown provider: {provider}")


async def run_agent(prompt: str, provider: str = "gemini") -> dict:
    """
    Run the browser agent with the given prompt.
    Returns {"result": str, "screenshot_url": str | None}.
    """
    llm = _create_llm(provider)

    profile = BrowserProfile(
        headless=True,   # True = invisible browser (good for server)
                         # False = visible browser (good for debugging)
    )
    browser = BrowserSession(browser_profile=profile)

    agent = Agent(task=prompt, llm=llm, browser=browser)

    history = await agent.run()

    result_text = history.final_result() or "Agent completed without a final result."

    screenshot_url = None
    screenshots = history.screenshots(n_last=1)
    if screenshots:
        raw_b64 = screenshots[0]
        if raw_b64.startswith("data:image"):
            raw_b64 = raw_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(raw_b64)

        from uuid import uuid4
        filename = f"{uuid4()}.png"
        destination = UPLOAD_DIR / filename
        destination.write_bytes(image_bytes)
        screenshot_url = f"/uploads/{filename}"

    return {"result": result_text, "screenshot_url": screenshot_url}
```

**Line-by-line explanation:**

```python
import asyncio
```
Python's async/await standard library. `browser-use`'s `agent.run()` is an async function —
it must be awaited. FastAPI supports async route handlers natively.

```python
import base64
```
Standard library for encoding/decoding binary data as ASCII text.
Playwright screenshots are returned as base64-encoded PNG strings.

```python
from browser_use import Agent, BrowserSession, BrowserProfile
```
The three core browser-use classes:
- `Agent` — the main agent that connects an LLM to a browser
- `BrowserSession` — represents an active browser session
- `BrowserProfile` — configuration for the browser (headless, channel, etc.)

```python
def _create_llm(provider: str = "gemini"):
```
A helper function that returns the appropriate LLM object based on the provider name.
The underscore prefix (`_`) is a Python convention meaning "private/internal function".

```python
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            api_key=settings.GEMINI_API_KEY,
        )
```
Lazy import — the `langchain-google-genai` package is only imported if you're using Gemini.
This avoids import errors if you haven't installed that specific provider package.

```python
    profile = BrowserProfile(
        headless=True,
    )
```
`headless=True` — Chrome runs without a visible window. In a server environment you must use
headless mode (no display available). For local debugging, set to `False` to watch the agent work.

```python
    browser = BrowserSession(browser_profile=profile)
    agent = Agent(task=prompt, llm=llm, browser=browser)
    history = await agent.run()
```
- `BrowserSession` — wraps the browser, opens it when needed
- `Agent(task=prompt, ...)` — creates the agent with your prompt as the goal
- `await agent.run()` — runs the agentic loop until done or max steps reached
- Returns `AgentHistoryList` containing every step taken

```python
    result_text = history.final_result() or "Agent completed without a final result."
```
`final_result()` returns the text the agent passed to `done(result)`. May be None if the
agent ran out of steps without completing.

```python
    screenshots = history.screenshots(n_last=1)
    if screenshots:
        raw_b64 = screenshots[0]
        if raw_b64.startswith("data:image"):
            raw_b64 = raw_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(raw_b64)
```
- `n_last=1` — get only the last screenshot (most relevant to the final result)
- Screenshots are base64 strings, sometimes prefixed with `data:image/png;base64,`
- Split on `,` to remove the prefix, decode the base64 to raw bytes

```python
        filename = f"{uuid4()}.png"
        destination = UPLOAD_DIR / filename
        destination.write_bytes(image_bytes)
        screenshot_url = f"/uploads/{filename}"
```
Save the screenshot to the uploads directory using the same UUID naming convention.
It becomes available at `http://localhost:8000/uploads/<filename>`.

---

## 6. Create `backend/app/api/routes/agent.py`

```python
from fastapi import APIRouter
from pydantic import BaseModel
from app.agent.runner import run_agent
import asyncio

router = APIRouter(prefix="/agent", tags=["Agent"])


class AgentRequest(BaseModel):
    prompt: str
    provider: str = "gemini"


class AgentResponse(BaseModel):
    status: str
    result: str
    screenshot_url: str | None = None


@router.post("/run", response_model=AgentResponse)
async def run_agent_endpoint(payload: AgentRequest):
    result = await run_agent(payload.prompt, payload.provider)
    return AgentResponse(
        status="completed",
        result=result["result"],
        screenshot_url=result["screenshot_url"],
    )
```

**Key concept — `async def`:**

```python
@router.post("/run", response_model=AgentResponse)
async def run_agent_endpoint(payload: AgentRequest):
    result = await run_agent(payload.prompt, payload.provider)
```

`async def` declares an async function. FastAPI automatically runs async route handlers
in Python's event loop.

`await run_agent(...)` pauses this function and gives control back to the event loop while
the agent runs (which takes seconds to minutes). Other requests can be handled during this time.

If you used `def` (synchronous), the entire server would be blocked until the agent finishes —
no other requests could be handled.

---

## 7. Register the Agent Router in `main.py`

Update `backend/app/main.py`:

```python
from app.api.routes import frameworks, controls, evidence, submissions, agent

# ...existing code...

app.include_router(agent.router, prefix="/api")
```

---

## 8. Update `frontend/src/api/client.ts`

Add the agent API at the end of the file:

```typescript
export const agentApi = {
  run: (prompt: string, provider: string = "gemini") =>
    api.post("/agent/run", { prompt, provider }).then((r) => r.data),
};
```

---

## 9. Update `frontend/src/pages/AgentRunner.tsx`

Replace the placeholder page with the real implementation:

```tsx
import { useState } from "react";
import { agentApi } from "../api/client";

export default function AgentRunner() {
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("gemini");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setStatus("running");
    setResult(null);
    setScreenshotUrl(null);
    setError(null);

    try {
      const data = await agentApi.run(prompt, provider);
      setResult(data.result);
      setScreenshotUrl(data.screenshot_url);
      setStatus("done");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Agent failed. Check the backend logs.");
      setStatus("error");
    }
  };

  return (
    <div className="page">
      <h1>AI Agent Runner</h1>
      <p className="subtitle">
        Describe what evidence to collect and the agent will navigate the portal automatically.
      </p>

      <form className="form" onSubmit={handleRun}>
        <div className="form-group">
          <label>LLM Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="gemini">Google Gemini (free tier)</option>
            <option value="anthropic">Anthropic Claude (paid)</option>
            <option value="ollama">Ollama (local — no API key)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder='e.g. "Go to google.com and take a screenshot of the homepage"'
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={status === "running"}
        >
          {status === "running" ? "Agent running..." : "Run Agent"}
        </button>
      </form>

      {status === "running" && (
        <div className="agent-log" style={{ marginTop: "1.5rem" }}>
          <p>Agent is working... this may take 30–120 seconds.</p>
        </div>
      )}

      {status === "error" && (
        <div className="alert" style={{ background: "#fee2e2", color: "#991b1b", marginTop: "1rem" }}>
          {error}
        </div>
      )}

      {status === "done" && result && (
        <div style={{ marginTop: "1.5rem" }}>
          <h2>Agent Result</h2>
          <div className="agent-log">
            <div className="log-box">
              <div className="log-line">{result}</div>
            </div>
          </div>

          {screenshotUrl && (
            <div style={{ marginTop: "1rem" }}>
              <h2>Screenshot</h2>
              <img
                src={`http://localhost:8000${screenshotUrl}`}
                alt="Agent screenshot"
                style={{ maxWidth: "100%", borderRadius: "8px", marginTop: "0.5rem" }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## 10. Test the Agent

Start the backend with the agent registered:

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Simple test via Swagger:**

1. Go to `http://localhost:8000/docs`
2. Open `POST /api/agent/run`
3. Body:
```json
{
  "prompt": "Go to https://google.com and take a screenshot of the search page",
  "provider": "gemini"
}
```
4. Execute — wait 30–120 seconds

Expected response:
```json
{
  "status": "completed",
  "result": "Successfully navigated to google.com and captured a screenshot of the search page.",
  "screenshot_url": "/uploads/3f4a1b2c.png"
}
```

**From the UI:**

Go to `http://localhost:5173/agent`, enter the same prompt, click Run Agent.

---

## 11. LLM Provider Comparison

| Provider | Model | Setup | Cost | Quality |
|---|---|---|---|---|
| Ollama | qwen2.5:7b | `ollama pull qwen2.5:7b` | Free | Medium |
| Ollama | llama3.1:8b | `ollama pull llama3.1:8b` | Free | Medium |
| Google Gemini | gemini-2.0-flash | API key | Free tier | High |
| Anthropic | claude-sonnet-4-6 | API key | Paid | Very High |

**Recommendation for getting started:** Use Gemini 2.0 Flash. It has a free tier, is fast,
and handles browser navigation tasks reliably. Get a free API key at `aistudio.google.com`.

**Ollama setup (for fully local, no internet required):**
```bash
# Download Ollama from ollama.com, then:
ollama pull qwen2.5:7b

# Verify it works:
ollama run qwen2.5:7b "Hello, what model are you?"
```

---

## 12. Known Issues and How to Handle Them

### Issue: Agent takes too long / times out

The agent may take 2–5 minutes for complex tasks. The FastAPI HTTP request will stay open
until the agent finishes. If you need non-blocking execution, implement a background task:

```python
from fastapi import BackgroundTasks

@router.post("/run")
async def run_agent_endpoint(payload: AgentRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid4())
    background_tasks.add_task(run_agent_background, task_id, payload.prompt, payload.provider)
    return {"task_id": task_id, "status": "started"}
```

This is a future enhancement (see `full-details.md` Roadmap section).

### Issue: Small LLMs hallucinate

`llama3.2` (3B parameters) often invents page elements that don't exist and gets stuck in loops.
Minimum recommended: `qwen2.5:7b` for local models, or Gemini/Claude for cloud models.

### Issue: Login pages and MFA

The agent cannot log in to services that require MFA (multi-factor authentication) without
additional credential injection setup. This is a limitation of the current implementation.

For portals you control, you can pass credentials via the prompt:
```
"Go to https://portal.example.com, log in with username admin@example.com and password [PASSWORD],
navigate to the settings page, and take a screenshot."
```

For MFA, you need to set up a browser session with cookies already authenticated, or configure
browser-use's credential manager (future feature).

### Issue: Page readiness timeouts

```
WARNING: Page readiness timeout waiting for network to settle
```

This is normal for slow-loading Azure/AWS portals. The agent automatically retries.
You can increase the timeout in the BrowserProfile if needed.

---

## 13. The Full Application Is Now Complete

After completing Stage 08, every feature described in `full-details.md` is implemented:

| Feature | Status |
|---|---|
| Upload evidence files | ✅ |
| Map evidence to controls | ✅ |
| View submission history | ✅ |
| Browse evidence by framework | ✅ |
| AI agent — natural language prompts | ✅ |
| AI agent — browser automation | ✅ |
| AI agent — screenshot capture | ✅ |
| Swagger API documentation | ✅ |

### Access Points

| URL | What You See |
|---|---|
| `http://localhost:5173` | React frontend |
| `http://localhost:8000/docs` | Swagger API documentation |
| `http://localhost:8000/health` | Backend health check |
| `http://localhost:8000/uploads/<file>` | Stored evidence files |

---

## 14. Future Roadmap

See `full-details.md` Section 19 for the full list. Top priorities:

1. **Azure Blob Storage** — replace `local_storage.py` with Azure Blob
2. **User authentication** — JWT login tied to WSO2 SSO
3. **Background task queue** — agent runs don't block the API
4. **WebSocket streaming** — real-time agent logs visible in the UI
