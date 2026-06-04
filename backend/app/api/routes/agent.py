from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agent.runner import (
    get_browser_status,
    is_paused,
    open_browser_at,
    pause_runner,
    resume_runner,
    run_agent,
)
from app.database import get_db
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
