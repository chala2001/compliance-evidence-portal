from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.control import Control
from app.schemas.control import ControlCreate, ControlResponse

router = APIRouter(prefix="/controls", tags=["Controls"])


@router.get("/", response_model=list[ControlResponse])
def list_controls(
    framework_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(Control)
    if framework_id:
        query = query.filter(Control.framework_id == framework_id)
    return query.all()


@router.post("/", response_model=ControlResponse, status_code=201)
def create_control(payload: ControlCreate, db: Session = Depends(get_db)):
    control = Control(**payload.model_dump())
    db.add(control)
    db.commit()
    db.refresh(control)
    return control


@router.get("/{control_id}", response_model=ControlResponse)
def get_control(control_id: int, db: Session = Depends(get_db)):
    control = db.query(Control).filter(Control.id == control_id).first()
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    return control
