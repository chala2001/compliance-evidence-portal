from datetime import datetime
from pydantic import BaseModel


class SubmissionCreate(BaseModel):
    evidence_id: int
    submitted_by: str
    notes: str | None = None


class SubmissionResponse(BaseModel):
    id: int
    evidence_id: int
    submitted_by: str
    submitted_at: datetime
    status: str
    notes: str | None

    model_config = {"from_attributes": True}
