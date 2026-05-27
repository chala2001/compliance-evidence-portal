from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agent.runner import run_agent
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


@router.post("/run")
async def run_agent_task(request: AgentRequest, db: Session = Depends(get_db)):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    if request.control_id is not None:
        control = db.query(Control).filter(Control.id == request.control_id).first()
        if not control:
            raise HTTPException(status_code=404, detail="Control not found")

    result = await run_agent(request.prompt)

    evidence_id = None
    submission_id = None

    if request.control_id is not None and result.get("file_name"):
        title = request.title or request.prompt[:80].strip()
        evidence = Evidence(
            title=f"AI Agent: {title}",
            description=request.prompt,
            file_name=result["file_name"],
            file_url=result["screenshot_url"],
            control_id=request.control_id,
        )
        db.add(evidence)
        db.commit()
        db.refresh(evidence)
        evidence_id = evidence.id

        notes_text = (result.get("result") or "")[:500]
        submission = Submission(
            evidence_id=evidence.id,
            submitted_by=request.submitted_by,
            status="pending",
            notes=f"Auto-submitted by AI agent. {notes_text}",
        )
        db.add(submission)
        db.commit()
        db.refresh(submission)
        submission_id = submission.id

    return {
        **result,
        "evidence_id": evidence_id,
        "submission_id": submission_id,
    }
