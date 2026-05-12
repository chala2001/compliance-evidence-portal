from pydantic import BaseModel


class ControlCreate(BaseModel):
    framework_id: int
    control_ref: str
    title: str
    description: str | None = None


class ControlResponse(BaseModel):
    id: int
    framework_id: int
    control_ref: str
    title: str
    description: str | None

    model_config = {"from_attributes": True}
