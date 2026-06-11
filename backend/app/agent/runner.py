import asyncio
import base64
import re
import time
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable

from browser_use import Agent, BrowserProfile, BrowserSession

from app.config import settings

DEFAULT_MAX_STEPS = 15

RUNS: dict[str, dict[str, Any]] = {}


# Approximate prices in USD per 1 million tokens (input, output).
# Match by substring against the model name in case-insensitive form.
# Update when providers change their published rates.
LLM_PRICING: list[tuple[str, tuple[float, float]]] = [
    ("gpt-4o-mini", (0.15, 0.60)),
    ("gpt-4o", (2.50, 10.00)),
    ("gpt-4.1-mini", (0.40, 1.60)),
    ("gpt-4.1", (2.00, 8.00)),
    ("gpt-5-mini", (0.50, 2.00)),
    ("gpt-5", (5.00, 15.00)),
    ("claude-haiku", (1.00, 5.00)),
    ("claude-sonnet", (3.00, 15.00)),
    ("claude-opus", (15.00, 75.00)),
    ("gemini-2.5-flash", (0.075, 0.30)),
    ("gemini-2.0-flash", (0.075, 0.30)),
    ("gemini-flash", (0.075, 0.30)),
    ("gemini", (1.25, 5.00)),
    ("qwen", (0.0, 0.0)),
    ("llama", (0.0, 0.0)),
    ("ollama", (0.0, 0.0)),
]


def _resolve_pricing(model: str) -> tuple[float, float]:
    m = (model or "").lower()
    for key, prices in LLM_PRICING:
        if key in m:
            return prices
    return (0.0, 0.0)


def _compute_cost(input_tokens: int, output_tokens: int, model: str) -> float:
    in_per_m, out_per_m = _resolve_pricing(model)
    return round((input_tokens / 1_000_000) * in_per_m + (output_tokens / 1_000_000) * out_per_m, 6)


class _TokenCounter:
    """Aggregates token usage across all LLM calls during one run.
    Works across browser-use native LLMs (ChatAzureOpenAI, ChatOllama, ...)
    AND LangChain LLMs (ChatAnthropic, ChatGoogleGenerativeAI)."""

    def __init__(self) -> None:
        self.input_tokens = 0
        self.output_tokens = 0
        self.calls = 0

    def _record_response(self, result) -> None:
        """Walk the LLM response object and pull whatever usage info we find."""
        self.calls += 1
        in_t, out_t = 0, 0

        # Path A: browser-use ChatInvokeCompletion.usage (ChatInvokeUsage)
        usage = getattr(result, "usage", None)
        if usage is not None:
            in_t = getattr(usage, "prompt_tokens", 0) or getattr(usage, "input_tokens", 0) or 0
            out_t = getattr(usage, "completion_tokens", 0) or getattr(usage, "output_tokens", 0) or 0

        # Path B: LangChain AIMessage with usage_metadata
        if not in_t and not out_t:
            meta = getattr(result, "usage_metadata", None)
            if meta:
                meta_d = meta if isinstance(meta, dict) else dict(meta)
                in_t = meta_d.get("input_tokens", 0) or meta_d.get("prompt_tokens", 0) or 0
                out_t = meta_d.get("output_tokens", 0) or meta_d.get("completion_tokens", 0) or 0

        # Path C: LangChain response_metadata.token_usage
        if not in_t and not out_t:
            rmeta = getattr(result, "response_metadata", None) or {}
            tu = rmeta.get("token_usage") or rmeta.get("usage") or {}
            in_t = tu.get("prompt_tokens", 0) or tu.get("input_tokens", 0) or 0
            out_t = tu.get("completion_tokens", 0) or tu.get("output_tokens", 0) or 0

        self.input_tokens += int(in_t or 0)
        self.output_tokens += int(out_t or 0)


def _attach_token_counter(llm) -> _TokenCounter:
    """Monkey-patch the LLM's ``ainvoke`` (and ``invoke`` if present) so every
    call records into a counter we control. Idempotent: if already attached,
    returns the existing counter (so multiple subtasks share one wrapper
    but each subtask can compute its delta with a snapshot).
    """
    existing = getattr(llm, "_compliance_token_counter", None)
    if existing is not None:
        return existing

    counter = _TokenCounter()
    original_ainvoke = getattr(llm, "ainvoke", None)
    if original_ainvoke is not None:
        async def tracked_ainvoke(*args, **kwargs):  # noqa: D401
            result = await original_ainvoke(*args, **kwargs)
            try:
                counter._record_response(result)
            except Exception:
                pass
            return result
        try:
            llm.ainvoke = tracked_ainvoke  # type: ignore[attr-defined]
        except Exception:
            pass

    original_invoke = getattr(llm, "invoke", None)
    if original_invoke is not None:
        def tracked_invoke(*args, **kwargs):
            result = original_invoke(*args, **kwargs)
            try:
                counter._record_response(result)
            except Exception:
                pass
            return result
        try:
            llm.invoke = tracked_invoke  # type: ignore[attr-defined]
        except Exception:
            pass

    try:
        llm._compliance_token_counter = counter  # type: ignore[attr-defined]
    except Exception:
        pass
    return counter

_SUBTASK_PATTERN = re.compile(r"^\s*(?:\d+[.)\-:]?|[-*•►▶→])\s+(.+)$")


def parse_subtasks(prompt: str) -> list[str]:
    lines = prompt.strip().splitlines()
    subtasks: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        m = _SUBTASK_PATTERN.match(line)
        if m:
            if current:
                subtasks.append(current)
            current = [m.group(1).strip()]
        elif current and line.strip():
            current.append(line.strip())
    if current:
        subtasks.append(current)
    joined = ["\n".join(s).strip() for s in subtasks]
    joined = [s for s in joined if s]
    return joined if joined else [prompt.strip()]


_pause_event = asyncio.Event()
_pause_event.set()


def pause_runner() -> None:
    _pause_event.clear()


def resume_runner() -> None:
    _pause_event.set()


def is_paused() -> bool:
    return not _pause_event.is_set()

UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

BROWSER_PROFILE_DIR = Path(__file__).parent.parent.parent / "browser_profile"
BROWSER_PROFILE_DIR.mkdir(exist_ok=True)

_shared_browser: BrowserSession | None = None


def _get_browser() -> BrowserSession:
    global _shared_browser
    if _shared_browser is None:
        channel = (settings.BROWSER_CHANNEL or "chrome").strip().lower()
        profile_dir = BROWSER_PROFILE_DIR / channel
        profile_dir.mkdir(exist_ok=True)
        profile = BrowserProfile(
            channel=channel,
            headless=False,
            user_data_dir=str(profile_dir),
            keep_alive=True,
        )
        _shared_browser = BrowserSession(browser_profile=profile)
    return _shared_browser


async def _reset_shared_browser() -> None:
    """Kill any cached BrowserSession and force a fresh launch next time."""
    global _shared_browser
    if _shared_browser is not None:
        try:
            await _shared_browser.kill()
        except Exception:
            pass
        try:
            await _shared_browser.stop()
        except Exception:
            pass
    _shared_browser = None


async def reset_browser() -> dict:
    await _reset_shared_browser()
    return {"status": "reset"}


async def open_browser_at(url: str) -> dict:
    async def _attempt() -> str:
        browser = _get_browser()
        await browser.start()
        await browser.navigate_to(url)
        # Verify the browser is actually responsive — a dead BrowserSession
        # silently accepts navigate_to but can't return a URL.
        return await browser.get_current_page_url()

    try:
        current_url = await _attempt()
        return {"status": "opened", "url": url, "current_url": current_url}
    except Exception:
        # Stale or dead singleton — drop it and retry once with a fresh launch.
        await _reset_shared_browser()
        current_url = await _attempt()
        return {"status": "opened", "url": url, "current_url": current_url, "recovered": True}


async def get_browser_status() -> dict:
    browser = _get_browser()
    try:
        current_url = await browser.get_current_page_url()
        return {"is_open": True, "current_url": current_url}
    except Exception:
        return {"is_open": False, "current_url": None}


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
    elif provider == "azure":
        from browser_use import ChatAzureOpenAI
        return ChatAzureOpenAI(
            model=model or "gpt-4o-mini",
            api_key=settings.AZURE_OPENAI_API_KEY,
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            azure_deployment=settings.AZURE_OPENAI_DEPLOYMENT,
            api_version=settings.AZURE_OPENAI_API_VERSION,
        )
    else:
        from browser_use import ChatOllama
        return ChatOllama(
            model=model or "qwen2.5:7b",
            timeout=180,  # 3 min — local models are slow
        )


AGENT_INSTRUCTIONS = """\
CRITICAL AUTHENTICATION RULES — READ FIRST:
- You are already logged in. A human user has already authenticated this browser session.
- DO NOT type any usernames, passwords, MFA codes, or credentials.
- DO NOT click "Sign in", "Log in", or "Continue" on any login page.
- DO NOT invent or guess credentials under any circumstance.
- If you see a login screen, sign-in prompt, or authentication challenge, STOP immediately
  and report: 'NOT_LOGGED_IN — user must authenticate first'.

SEARCH & NAVIGATION STRATEGY (be smart, not literal):
- When asked to find a resource by name (S3 bucket, Key Vault, VM, etc.):
  1. Try the EXACT name the user gave you first.
  2. If no exact match, try common variations:
     - swap hyphens / underscores / spaces: "cloud-care", "cloud_care", "cloudcare", "cloud care"
     - try lowercase, Title Case, UPPERCASE
     - try with common prefixes/suffixes: "dev-X", "prod-X", "X-bucket", "X-prod"
  3. If still no match, list all available resources and pick the one whose name
     is MOST SIMILAR (case-insensitive substring match, fuzzy match on words).
     Example: asked for "cloud-care", saw "cloudcare-prod-storage" → that's the match.
  4. If there are multiple candidates, pick the most likely one AND screenshot the full list
     so the user can verify.
- For cloud consoles with regions (AWS), if a resource is not found, also try switching
  regions or check the "global" / "all regions" view.
- Always prefer capturing SOMETHING relevant over giving up empty-handed.

SCREENSHOT STRATEGY:
- Wait for the page to FULLY render before screenshotting (wait for loading spinners to clear).
- Scroll if needed to bring the relevant section into view.
- Capture CONTEXT — include enough surrounding UI (page title, breadcrumbs, panel headers)
  so an auditor understands what they're looking at.
- If you can't find the exact thing asked for, screenshot the CLOSEST related view
  (e.g. the resource list, the parent service page) so the user has useful evidence.

REPORTING (always in your final answer):
- WHAT YOU WERE ASKED to find or do.
- WHAT YOU ACTUALLY FOUND: exact match, close match, or "nothing similar found".
- ANY VARIATIONS or substitutions you tried (e.g. "tried cloud-care, cloud_care, cloudcare;
  found 'cloudcare-prod' which appears to be the same resource").
- ANY BLOCKERS (permission errors, region issues, page didn't load).

TASK TO PERFORM (assume you are already authenticated):
"""


def _save_screenshot(raw: str) -> tuple[str, str]:
    if raw.startswith("data:image"):
        raw = raw.split(",", 1)[1]
    name = f"{uuid.uuid4()}.png"
    (UPLOAD_DIR / name).write_bytes(base64.b64decode(raw))
    return name, f"/uploads/{name}"


async def run_agent(prompt: str, region_hint: str | None = None) -> dict:
    llm = _build_llm()
    browser = _get_browser()
    await browser.start()

    subtasks = parse_subtasks(prompt)
    context_prefix = ""
    if region_hint and region_hint.strip():
        context_prefix = (
            "ENVIRONMENT CONTEXT (apply to all tasks):\n"
            f"{region_hint.strip()}\n"
            "Before searching for any resource, ensure you have switched to the correct "
            "region/subscription/workspace mentioned above. If you are in a different "
            "region, switch first (use the region selector usually at the top-right of "
            "AWS / Azure consoles), then continue with the task.\n\n"
        )

    _pause_event.set()

    all_screenshots: list[dict] = []
    all_results: list[dict] = []
    paused_between: list[int] = []

    for idx, subtask in enumerate(subtasks):
        if idx > 0:
            if is_paused():
                paused_between.append(idx + 1)
            await _pause_event.wait()

        full_task = AGENT_INSTRUCTIONS + context_prefix + subtask
        agent = Agent(task=full_task, llm=llm, browser=browser, use_vision=True)
        history = await agent.run(max_steps=DEFAULT_MAX_STEPS)

        result_text = history.final_result() or f"Subtask {idx + 1} completed"
        all_results.append({"subtask": subtask, "result": str(result_text)})

        screenshots = history.screenshots()
        if screenshots:
            name, url = _save_screenshot(screenshots[-1])
            all_screenshots.append({
                "subtask": subtask[:120],
                "subtask_index": idx + 1,
                "file_name": name,
                "file_url": url,
            })

    combined_result = "\n\n".join(
        f"[Task {i + 1}] {r['result']}" for i, r in enumerate(all_results)
    )

    last_shot = all_screenshots[-1] if all_screenshots else None
    return {
        "status": "completed",
        "result": combined_result,
        "subtask_count": len(subtasks),
        "subtasks": all_results,
        "screenshots": all_screenshots,
        "paused_between_tasks": paused_between,
        "screenshot_url": last_shot["file_url"] if last_shot else None,
        "file_name": last_shot["file_name"] if last_shot else None,
    }


def _build_context_prefix(region_hint: str | None) -> str:
    if not region_hint or not region_hint.strip():
        return ""
    return (
        "ENVIRONMENT CONTEXT (apply to all tasks):\n"
        f"{region_hint.strip()}\n"
        "Before searching for any resource, ensure you have switched to the correct "
        "region/subscription/workspace mentioned above. If you are in a different "
        "region, switch first (use the region selector usually at the top-right of "
        "AWS / Azure consoles), then continue with the task.\n\n"
    )


async def _execute_run(
    run_id: str,
    on_subtask_complete: Callable[[str, dict, str], Awaitable[tuple[int | None, int | None]]] | None = None,
) -> None:
    run = RUNS[run_id]
    try:
        llm = _build_llm()
        browser = _get_browser()
        await browser.start()

        subtasks = parse_subtasks(run["prompt"])
        run["subtasks"] = [
            {"index": i, "text": s, "status": "pending", "result": None, "screenshot": None, "evidence_id": None, "submission_id": None}
            for i, s in enumerate(subtasks)
        ]
        run["status"] = "running"

        context_prefix = _build_context_prefix(run.get("region_hint"))
        max_steps = int(run.get("max_steps_per_task") or DEFAULT_MAX_STEPS)
        max_steps = max(5, min(60, max_steps))
        _pause_event.set()

        for idx, subtask_obj in enumerate(run["subtasks"]):
            if idx > 0 and is_paused():
                run["status"] = "paused"
                await _pause_event.wait()
                run["status"] = "running"

            run["current_index"] = idx
            subtask_obj["status"] = "running"
            subtask_obj["started_at"] = time.time()

            mod = run.get("modifications", {}).get(idx) or run.get("modifications", {}).get(str(idx))
            extra = ""
            if mod:
                extra = f"\n\nADDITIONAL INSTRUCTIONS FROM USER FOR THIS TASK (apply on top of the task above):\n{mod}\n"
                subtask_obj["modification"] = mod

            full_task = AGENT_INSTRUCTIONS + context_prefix + subtask_obj["text"] + extra
            counter = _attach_token_counter(llm)
            counter_before = (counter.input_tokens, counter.output_tokens, counter.calls)
            agent = Agent(task=full_task, llm=llm, browser=browser, use_vision=True)
            history = await agent.run(max_steps=max_steps)

            in_tokens = counter.input_tokens - counter_before[0]
            out_tokens = counter.output_tokens - counter_before[1]
            llm_calls = counter.calls - counter_before[2]
            cost = _compute_cost(in_tokens, out_tokens, settings.AGENT_MODEL)
            subtask_obj["usage"] = {
                "input_tokens": in_tokens,
                "output_tokens": out_tokens,
                "total_tokens": in_tokens + out_tokens,
                "llm_calls": llm_calls,
                "cost_usd": cost,
                "model": settings.AGENT_MODEL,
            }

            run["total_usage"] = {
                "input_tokens": sum(t.get("usage", {}).get("input_tokens", 0) for t in run["subtasks"]),
                "output_tokens": sum(t.get("usage", {}).get("output_tokens", 0) for t in run["subtasks"]),
                "total_tokens": sum(t.get("usage", {}).get("total_tokens", 0) for t in run["subtasks"]),
                "llm_calls": sum(t.get("usage", {}).get("llm_calls", 0) for t in run["subtasks"]),
                "cost_usd": round(sum(t.get("usage", {}).get("cost_usd", 0.0) for t in run["subtasks"]), 6),
                "model": settings.AGENT_MODEL,
            }

            result_text = str(history.final_result() or f"Subtask {idx + 1} completed")
            subtask_obj["result"] = result_text

            screenshots = history.screenshots()
            if screenshots:
                name, url = _save_screenshot(screenshots[-1])
                shot = {
                    "subtask": subtask_obj["text"][:120],
                    "subtask_index": idx + 1,
                    "file_name": name,
                    "file_url": url,
                }
                subtask_obj["screenshot"] = shot
                if on_subtask_complete:
                    try:
                        evidence_id, submission_id = await on_subtask_complete(run_id, shot, result_text)
                        subtask_obj["evidence_id"] = evidence_id
                        subtask_obj["submission_id"] = submission_id
                    except Exception as ex:
                        subtask_obj["persist_error"] = str(ex)

            subtask_obj["status"] = "completed"
            subtask_obj["completed_at"] = time.time()

        run["status"] = "completed"
        run["completed_at"] = time.time()
    except Exception as e:
        run["status"] = "error"
        run["error"] = str(e)
        run["completed_at"] = time.time()


def start_background_run(
    prompt: str,
    region_hint: str | None,
    control_id: int | None,
    title: str | None,
    submitted_by: str,
    max_steps_per_task: int | None = None,
    on_subtask_complete: Callable[[str, dict, str], Awaitable[tuple[int | None, int | None]]] | None = None,
) -> str:
    run_id = uuid.uuid4().hex[:12]
    RUNS[run_id] = {
        "run_id": run_id,
        "prompt": prompt,
        "region_hint": region_hint,
        "control_id": control_id,
        "title": title,
        "submitted_by": submitted_by,
        "max_steps_per_task": max_steps_per_task or DEFAULT_MAX_STEPS,
        "subtasks": [],
        "current_index": -1,
        "status": "starting",
        "started_at": time.time(),
        "completed_at": None,
        "error": None,
        "modifications": {},
        "total_usage": {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "llm_calls": 0,
            "cost_usd": 0.0,
            "model": settings.AGENT_MODEL,
        },
    }
    asyncio.create_task(_execute_run(run_id, on_subtask_complete=on_subtask_complete))
    return run_id
