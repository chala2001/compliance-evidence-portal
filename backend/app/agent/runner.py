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
        profile = BrowserProfile(
            channel="chrome",
            headless=False,
            user_data_dir=str(BROWSER_PROFILE_DIR),
            keep_alive=True,
        )
        _shared_browser = BrowserSession(browser_profile=profile)
    return _shared_browser


async def open_browser_at(url: str) -> dict:
    browser = _get_browser()
    await browser.start()
    await browser.navigate_to(url)
    return {"status": "opened", "url": url}


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
            agent = Agent(task=full_task, llm=llm, browser=browser, use_vision=True)
            history = await agent.run(max_steps=DEFAULT_MAX_STEPS)

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
        "subtasks": [],
        "current_index": -1,
        "status": "starting",
        "started_at": time.time(),
        "completed_at": None,
        "error": None,
        "modifications": {},
    }
    asyncio.create_task(_execute_run(run_id, on_subtask_complete=on_subtask_complete))
    return run_id
