from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.evidence import Evidence
from app.models.submission import Submission
from app.schemas.evidence import EvidenceResponse
from app.storage.local_storage import save_file, delete_file

router = APIRouter(prefix="/evidence", tags=["Evidence"])


@router.get("/", response_model=list[EvidenceResponse])
def list_evidence(db: Session = Depends(get_db)):
    return db.query(Evidence).all()


@router.post("/", response_model=EvidenceResponse, status_code=201)
def create_evidence(
    title: str = Form(...),
    control_id: int = Form(...),
    description: str | None = Form(default=None),
    submitted_by: str = Form(default="manual-user"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    file_name, file_url = save_file(file)
    evidence = Evidence(
        title=title,
        description=description,
        file_name=file_name,
        file_url=file_url,
        control_id=control_id,
    )
    db.add(evidence)
    db.commit()
    db.refresh(evidence)

    submission = Submission(
        evidence_id=evidence.id,
        submitted_by=submitted_by,
        status="pending",
        notes=f"Manual upload via Submit page. {description or ''}".strip(),
    )
    db.add(submission)
    db.commit()

    return evidence


@router.get("/{evidence_id}", response_model=EvidenceResponse)
def get_evidence(evidence_id: int, db: Session = Depends(get_db)):
    evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return evidence


@router.delete("/{evidence_id}", status_code=204)
def delete_evidence(evidence_id: int, db: Session = Depends(get_db)):
    evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    delete_file(evidence.file_name)
    db.delete(evidence)
    db.commit()