from datetime import datetime
from pydantic import BaseModel


class EvidenceCreate(BaseModel):
    title: str
    description: str | None = None
    file_name: str
    file_url: str
    control_id: int


class EvidenceResponse(BaseModel):
    id: int
    title: str
    description: str | None
    file_name: str
    file_url: str
    control_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
