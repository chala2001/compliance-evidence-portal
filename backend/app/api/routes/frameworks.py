from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.framework import Framework
from app.schemas.framework import FrameworkCreate, FrameworkResponse

router = APIRouter(prefix="/frameworks", tags=["Frameworks"])


@router.get("/", response_model=list[FrameworkResponse])
def list_frameworks(db: Session = Depends(get_db)):
    return db.query(Framework).all()


@router.post("/", response_model=FrameworkResponse, status_code=201)
def create_framework(payload: FrameworkCreate, db: Session = Depends(get_db)):
    framework = Framework(**payload.model_dump())
    db.add(framework)
    db.commit()
    db.refresh(framework)
    return framework


@router.get("/{framework_id}", response_model=FrameworkResponse)
def get_framework(framework_id: int, db: Session = Depends(get_db)):
    framework = db.query(Framework).filter(Framework.id == framework_id).first()
    if not framework:
        raise HTTPException(status_code=404, detail="Framework not found")
    return framework
