from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agent.runner import (
    RUNS,
    get_browser_status,
    is_paused,
    open_browser_at,
    pause_runner,
    resume_runner,
    run_agent,
    start_background_run,
)
from app.database import SessionLocal, get_db
from app.models.control import Control
from app.models.evidence import Evidence
from app.models.submission import Submission

router = APIRouter(prefix="/agent", tags=["Agent"])


class AgentRequest(BaseModel):
    prompt: str
    control_id: int | None = None
    title: str | None = None
    submitted_by: str = "ai-agent"
    region_hint: str | None = None
    max_steps_per_task: int | None = None


class OpenPortalRequest(BaseModel):
    url: str


@router.post("/open-portal")
async def open_portal(request: OpenPortalRequest):
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    if not (url.startswith("http://") or url.startswith("https://")):
        url = "https://" + url
    return await open_browser_at(url)


@router.get("/browser-status")
async def browser_status():
    return await get_browser_status()


@router.post("/pause")
async def pause():
    pause_runner()
    return {"is_paused": is_paused()}


@router.post("/resume")
async def resume():
    resume_runner()
    return {"is_paused": is_paused()}


@router.get("/run-status")
async def run_status():
    return {"is_paused": is_paused()}


@router.post("/run")
async def run_agent_task(request: AgentRequest, db: Session = Depends(get_db)):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    if request.control_id is not None:
        control = db.query(Control).filter(Control.id == request.control_id).first()
        if not control:
            raise HTTPException(status_code=404, detail="Control not found")

    result = await run_agent(request.prompt, region_hint=request.region_hint)

    evidence_ids: list[int] = []
    submission_ids: list[int] = []
    screenshots = result.get("screenshots") or []

    if request.control_id is not None and screenshots:
        title_base = (request.title or request.prompt[:80]).strip()
        multi = len(screenshots) > 1

        for shot in screenshots:
            suffix = f" — Task {shot['subtask_index']}" if multi else ""
            evidence = Evidence(
                title=f"AI Agent: {title_base}{suffix}",
                description=shot.get("subtask") or request.prompt,
                file_name=shot["file_name"],
                file_url=shot["file_url"],
                control_id=request.control_id,
            )
            db.add(evidence)
            db.commit()
            db.refresh(evidence)
            evidence_ids.append(evidence.id)

            notes_text = (result.get("result") or "")[:500]
            submission = Submission(
                evidence_id=evidence.id,
                submitted_by=request.submitted_by,
                status="pending",
                notes=f"Auto-submitted by AI agent (task {shot['subtask_index']}). {notes_text}",
            )
            db.add(submission)
            db.commit()
            db.refresh(submission)
            submission_ids.append(submission.id)

    return {
        **result,
        "evidence_id": evidence_ids[0] if evidence_ids else None,
        "submission_id": submission_ids[0] if submission_ids else None,
        "evidence_ids": evidence_ids,
        "submission_ids": submission_ids,
    }


class ModifyNextRequest(BaseModel):
    additional_instruction: str


@router.post("/start-run")
async def start_run(request: AgentRequest, db: Session = Depends(get_db)):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
    if request.control_id is not None:
        control = db.query(Control).filter(Control.id == request.control_id).first()
        if not control:
            raise HTTPException(status_code=404, detail="Control not found")

    title_base = (request.title or request.prompt[:80]).strip()
    control_id = request.control_id
    submitted_by = request.submitted_by

    async def persist_subtask(run_id: str, shot: dict, result_text: str) -> tuple[int | None, int | None]:
        if control_id is None:
            return None, None
        s = SessionLocal()
        try:
            evidence = Evidence(
                title=f"AI Agent: {title_base} — Task {shot['subtask_index']}",
                description=shot.get("subtask") or RUNS[run_id]["prompt"],
                file_name=shot["file_name"],
                file_url=shot["file_url"],
                control_id=control_id,
            )
            s.add(evidence)
            s.commit()
            s.refresh(evidence)
            submission = Submission(
                evidence_id=evidence.id,
                submitted_by=submitted_by,
                status="pending",
                notes=f"Auto-submitted by AI agent (task {shot['subtask_index']}). {result_text[:500]}",
            )
            s.add(submission)
            s.commit()
            s.refresh(submission)
            return evidence.id, submission.id
        finally:
            s.close()

    run_id = start_background_run(
        prompt=request.prompt,
        region_hint=request.region_hint,
        control_id=request.control_id,
        title=request.title,
        submitted_by=request.submitted_by,
        max_steps_per_task=request.max_steps_per_task,
        on_subtask_complete=persist_subtask,
    )
    return {"run_id": run_id, "status": "starting"}


@router.get("/runs/{run_id}")
async def get_run(run_id: str):
    run = RUNS.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.post("/runs/{run_id}/modify-next")
async def modify_next(run_id: str, request: ModifyNextRequest):
    run = RUNS.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    next_idx = (run.get("current_index", -1) if run.get("status") == "paused" else run.get("current_index", -1)) + 1
    if next_idx < 0 or next_idx >= len(run.get("subtasks", [])):
        raise HTTPException(status_code=400, detail="No next task available to modify")
    run.setdefault("modifications", {})[next_idx] = request.additional_instruction.strip()
    return {"modified_index": next_idx, "instruction": request.additional_instruction.strip()}
