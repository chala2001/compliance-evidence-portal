from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agent.runner import run_agent

router = APIRouter(prefix="/agent", tags=["Agent"])


class AgentRequest(BaseModel):
    prompt: str


@router.post("/run")
async def run_agent_task(request: AgentRequest):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
    result = await run_agent(request.prompt)
    return result