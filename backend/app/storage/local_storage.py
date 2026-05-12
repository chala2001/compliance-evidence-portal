import uuid
import shutil
from pathlib import Path
from fastapi import UploadFile

UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


def save_file(file: UploadFile) -> tuple[str, str]:
    extension = Path(file.filename).suffix
    unique_name = f"{uuid.uuid4()}{extension}"
    destination = UPLOAD_DIR / unique_name

    with destination.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return unique_name, f"/uploads/{unique_name}"


def delete_file(file_name: str) -> None:
    target = UPLOAD_DIR / file_name
    if target.exists():
        target.unlink()