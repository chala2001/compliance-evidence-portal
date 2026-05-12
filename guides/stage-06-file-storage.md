# Stage 06 — File Storage and the Evidence Route (Phase 4)

In this stage you add support for uploading files and serving them back.
Evidence files (screenshots, PDFs, config exports) are stored on the local filesystem
and served at `http://localhost:8000/uploads/<filename>`.

At the end of this stage you can upload a file via the API and access it via its URL.

---

## 1. Why File Uploads Are Different

When you submit a simple form — username and password — the browser sends the data as JSON:

```json
{"username": "alice", "password": "secret"}
```

When you submit a form with a file attachment, JSON is not enough. A file is binary data —
it cannot be cleanly embedded in JSON. Instead, the browser uses `multipart/form-data`.

### What `multipart/form-data` Looks Like

```
POST /api/evidence/
Content-Type: multipart/form-data; boundary=----BOUNDARY123

------BOUNDARY123
Content-Disposition: form-data; name="title"

Key Vault Access Policy Screenshot
------BOUNDARY123
Content-Disposition: form-data; name="control_id"

1
------BOUNDARY123
Content-Disposition: form-data; name="file"; filename="screenshot.png"
Content-Type: image/png

<binary image data>
------BOUNDARY123--
```

Each part has a name and value. Text fields and files are all separate parts.
FastAPI uses `Form()` for text parts and `File()` for file parts.

### Why `python-multipart` Is Required

FastAPI cannot parse `multipart/form-data` without `python-multipart` installed.
If you try to use `Form()` or `File()` without it, FastAPI raises:
```
RuntimeError: Form data requires "python-multipart" to be installed.
```

You installed it in Stage 02: `pip install ... python-multipart`.

---

## 2. Create `app/storage/local_storage.py`

```python
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
```

**Line-by-line explanation:**

```python
import uuid
```
`uuid` generates Universally Unique Identifiers — random 128-bit numbers formatted as hex.
Example: `3f4a1b2c-8d9e-4f5a-b6c7-d8e9f0a1b2c3`

```python
import shutil
```
`shutil` provides high-level file operations. `shutil.copyfileobj` copies from one file-like
object to another efficiently.

```python
from pathlib import Path
```
`Path` — OS-independent file path handling.

```python
from fastapi import UploadFile
```
`UploadFile` is FastAPI's type for uploaded files. It wraps the raw file data with helpful
attributes like `filename` (original name) and `file` (the binary file object).

```python
UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
```
- `__file__` = `.../backend/app/storage/local_storage.py`
- `.parent` = `.../backend/app/storage/`
- `.parent.parent` = `.../backend/app/`
- `.parent.parent.parent` = `.../backend/`
- `/ "uploads"` = `.../backend/uploads/`

Why go up three levels? The storage module lives 3 levels deep inside `backend/`.
The `uploads/` directory should be at `backend/uploads/`, not nested inside the app code.

```python
UPLOAD_DIR.mkdir(exist_ok=True)
```
Creates `uploads/` directory when this module is first imported.
`exist_ok=True` — silently skip if the directory already exists.

```python
def save_file(file: UploadFile) -> tuple[str, str]:
```
Takes an `UploadFile` and returns a tuple of `(filename, url)`.

```python
    extension = Path(file.filename).suffix
```
`file.filename` is the original filename, e.g. `"screenshot.png"`.
`Path("screenshot.png").suffix` = `".png"` — just the extension.

```python
    unique_name = f"{uuid.uuid4()}{extension}"
```
`uuid.uuid4()` generates a random UUID.
Result: `"3f4a1b2c-8d9e-4f5a-b6c7-d8e9f0a1b2c3.png"`

**Why UUID filenames?**
If two users upload files named `screenshot.png`, using the original name would cause
a collision — the second upload overwrites the first. UUIDs are statistically guaranteed
to be unique across all uploads.

Also hides the original filename from the URL — preventing filename-based enumeration attacks.

```python
    destination = UPLOAD_DIR / unique_name
```
Full path: `.../backend/uploads/3f4a1b2c-uuid.png`

```python
    with destination.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
```
- `destination.open("wb")` — open the destination file for writing in binary mode
- `file.file` — the underlying file-like object from the HTTP request
- `shutil.copyfileobj(src, dst)` — streams bytes from `src` to `dst` in chunks
  This is memory-efficient — it doesn't load the entire file into RAM at once.

```python
    return unique_name, f"/uploads/{unique_name}"
```
Returns two values:
- `unique_name` — stored in the `evidence.file_name` column (for deletion lookups)
- `/uploads/{unique_name}` — stored in `evidence.file_url` (for serving the file)

```python
def delete_file(file_name: str) -> None:
    target = UPLOAD_DIR / file_name
    if target.exists():
        target.unlink()
```
- `target.exists()` — check if the file actually exists before trying to delete
- `target.unlink()` — delete the file from disk
- If the file doesn't exist (already deleted, or was never saved) — do nothing silently

---

## 3. Create `app/api/routes/evidence.py`

```python
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.evidence import Evidence
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
```

**Line-by-line explanation of the POST route:**

```python
@router.post("/", response_model=EvidenceResponse, status_code=201)
def create_evidence(
    title: str = Form(...),
    control_id: int = Form(...),
    description: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
```
This function signature is unusual — why are parameters spread out instead of using a Pydantic schema?

Because the request is `multipart/form-data`, not JSON. FastAPI cannot bind a JSON body when
the Content-Type is multipart. Instead, each form field is declared with `Form(...)`.

- `Form(...)` — `...` means required (like `required=True`)
- `Form(default=None)` — optional form field, defaults to None
- `File(...)` — declares this parameter as an uploaded file, required
- `UploadFile` — the type that wraps the uploaded binary data

```python
    file_name, file_url = save_file(file)
```
Calls `save_file()` from the storage layer. Receives two return values:
- `file_name` = `"3f4a1b2c.png"` (UUID name for disk storage)
- `file_url` = `"/uploads/3f4a1b2c.png"` (URL for accessing the file)

```python
    evidence = Evidence(
        title=title,
        description=description,
        file_name=file_name,
        file_url=file_url,
        control_id=control_id,
    )
```
Creates the SQLAlchemy Evidence object. Note that `title`, `description`, `control_id` come
from the form fields, while `file_name` and `file_url` come from `save_file()`.

**The DELETE route:**

```python
@router.delete("/{evidence_id}", status_code=204)
def delete_evidence(evidence_id: int, db: Session = Depends(get_db)):
    evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    delete_file(evidence.file_name)
    db.delete(evidence)
    db.commit()
```
- HTTP 204 No Content — standard response for successful DELETE (no body returned)
- First deletes the physical file from disk
- Then deletes the database record
- Order matters: if you delete the DB record first and the file deletion fails, you have an
  orphaned file with no way to clean it up via the API

---

## 4. How Files Are Served

After uploading, the file is at `backend/uploads/3f4a1b2c.png`.
The `file_url` stored in the database is `/uploads/3f4a1b2c.png`.

In `main.py`:
```python
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
```

FastAPI serves any request to `/uploads/<filename>` from the `uploads/` directory.
So `http://localhost:8000/uploads/3f4a1b2c.png` returns the file bytes.

The frontend links directly to this URL:
```tsx
<a href={`http://localhost:8000${e.file_url}`} target="_blank">
  {e.file_name}
</a>
```

---

## 5. Register the Evidence Router in `main.py`

Make sure `main.py` includes the evidence router:

```python
from app.api.routes import frameworks, controls, evidence, submissions

app.include_router(evidence.router, prefix="/api")
```

---

## 6. Test the Full Upload Flow

Start the backend:
```bash
cd backend && source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Option A: Swagger UI**

1. Go to `http://localhost:8000/docs`
2. Open `POST /api/evidence/`
3. Click "Try it out"
4. Fill: `title = "Test Evidence"`, `control_id = 1`
5. Choose a file to upload
6. Click Execute
7. Response should be `201` with the evidence object including `file_url`

**Option B: curl command**

```bash
curl -X POST "http://localhost:8000/api/evidence/" \
  -F "title=Test Evidence" \
  -F "control_id=1" \
  -F "file=@/path/to/your/screenshot.png"
```

**Verify the file was saved:**
```bash
ls backend/uploads/
# Should show a UUID-named file like: 3f4a1b2c-8d9e-4f5a-b6c7-d8e9f0a1b2c3.png
```

**Access the file:**
Open `http://localhost:8000/uploads/<filename>` in a browser.

---

## 7. Storage Layer Architecture — Why It's Isolated

The storage functions are in `app/storage/local_storage.py`, completely separate from the
route handler. The route handler calls `save_file(file)` and gets back a URL — it doesn't
know or care whether files go to the local filesystem, Azure Blob, or S3.

To switch to Azure Blob Storage later:
1. Create `app/storage/azure_storage.py` with the same function signatures:
   ```python
   def save_file(file: UploadFile) -> tuple[str, str]: ...
   def delete_file(file_name: str) -> None: ...
   ```
2. Change one import in `evidence.py`:
   ```python
   # from app.storage.local_storage import save_file, delete_file
   from app.storage.azure_storage import save_file, delete_file
   ```

No other code changes. This is the **isolation pattern** — keep the storage mechanism
behind a simple interface so you can swap it without touching business logic.

---

## 8. Next Stage

File upload and serving works.
Move on to [stage-07-react-frontend.md](stage-07-react-frontend.md) to build the React
TypeScript frontend that calls these API endpoints.
