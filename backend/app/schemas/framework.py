from pydantic import BaseModel


class FrameworkCreate(BaseModel):
    name: str
    description: str | None = None


class FrameworkResponse(BaseModel):
    id: int
    name: str
    description: str | None

    model_config = {"from_attributes": True}
