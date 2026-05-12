from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.submission import Submission
from app.schemas.submission import SubmissionCreate, SubmissionResponse

router = APIRouter(prefix="/submissions", tags=["Submissions"])


@router.get("/", response_model=list[SubmissionResponse])
def list_submissions(db: Session = Depends(get_db)):
    return db.query(Submission).all()


@router.post("/", response_model=SubmissionResponse, status_code=201)
def create_submission(payload: SubmissionCreate, db: Session = Depends(get_db)):
    submission = Submission(**payload.model_dump())
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


@router.get("/{submission_id}", response_model=SubmissionResponse)
def get_submission(submission_id: int, db: Session = Depends(get_db)):
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission