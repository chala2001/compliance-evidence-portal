# Stage 05 — Pydantic Schemas and API Routes (Phase 3)

In this stage you create the request/response shapes (Pydantic schemas) and the HTTP route
handlers (FastAPI routers) for all four resources: frameworks, controls, evidence, and submissions.

At the end of this stage `http://localhost:8000/docs` shows all 10+ endpoints and you can
create, list, and retrieve resources.

---

## 1. Why Two Layers? Models vs Schemas

You might wonder: you already have SQLAlchemy models that describe the data shape — why do
you need Pydantic schemas too?

**SQLAlchemy models** describe the *database*:
- How data is stored (column types, constraints, relationships)
- How to query, insert, and update rows

**Pydantic schemas** describe the *API*:
- What fields the client must send (request body)
- What fields the server sends back (response body)
- How to validate input before touching the database

They serve different purposes and should be separate. Examples of why:

1. You never send `id`, `created_at`, `updated_at` in a POST request — those are set by the
   database. The `Create` schema omits them. The `Response` schema includes them.

2. The Evidence `Create` schema (EvidenceCreate) includes `file_name` and `file_url` — but
   the actual evidence POST route doesn't use these because the file is handled separately.
   The schema and route don't always map 1:1.

3. You can expose only a subset of columns. If you add a sensitive internal field to a model
   later, you don't have to include it in the Response schema.

### The Pattern

```
Client sends JSON   →   Pydantic validates it   →   SQLAlchemy stores it
SQLAlchemy loads it →   Pydantic serializes it  →   Client receives JSON
```

---

## 2. Create `app/schemas/framework.py`

```python
from pydantic import BaseModel


class FrameworkCreate(BaseModel):
    name: str
    description: str | None = None


class FrameworkResponse(BaseModel):
    id: int
    name: str
    description: str | None

    model_config = {"from_attributes": True}
```

**Line-by-line explanation:**

```python
from pydantic import BaseModel
```
Import Pydantic's base class. All schema classes inherit from it.

```python
class FrameworkCreate(BaseModel):
    name: str
    description: str | None = None
```
This schema is used for `POST /api/frameworks/` requests.
- `name: str` — required field, must be a string
- `description: str | None = None` — optional field: can be a string OR None, defaults to None
- `str | None` is Python 3.10+ union syntax (equivalent to `Optional[str]`)

If the client sends `{"name": "SOC2"}` — valid.
If the client sends `{}` — invalid, Pydantic raises a 422 error because `name` is missing.
If the client sends `{"name": 123}` — valid! Pydantic coerces `123` to `"123"`.

```python
class FrameworkResponse(BaseModel):
    id: int
    name: str
    description: str | None

    model_config = {"from_attributes": True}
```
This schema is used for responses — what the API sends back.
- `id: int` — included in response (not in Create)
- `model_config = {"from_attributes": True}` — this is the key setting

Without `from_attributes`: Pydantic expects a dictionary to build the schema from.
With `from_attributes`: Pydantic can also read from object attributes (like a SQLAlchemy model).

This allows:
```python
framework = db.query(Framework).first()  # SQLAlchemy object
response = FrameworkResponse.model_validate(framework)  # reads .id, .name, .description
```

FastAPI does this automatically when you set `response_model=FrameworkResponse` on a route.

---

## 3. Create `app/schemas/control.py`

```python
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
```

`ControlCreate` requires `framework_id` — the client must specify which framework this control
belongs to. FastAPI will reject requests without it.

---

## 4. Create `app/schemas/evidence.py`

```python
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
```

`EvidenceResponse` includes `created_at` and `updated_at` — the frontend uses these to show
"uploaded on 2026-05-12". They are set by the database and returned in responses.

---

## 5. Create `app/schemas/submission.py`

```python
from datetime import datetime
from pydantic import BaseModel


class SubmissionCreate(BaseModel):
    evidence_id: int
    submitted_by: str
    notes: str | None = None


class SubmissionResponse(BaseModel):
    id: int
    evidence_id: int
    submitted_by: str
    submitted_at: datetime
    status: str
    notes: str | None

    model_config = {"from_attributes": True}
```

`SubmissionCreate` does not include `status` — the status starts as `"pending"` (set by the
model default). The reviewer changes it later (future feature).

---

## 6. Create `app/api/routes/frameworks.py`

```python
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
```

**Line-by-line explanation:**

```python
router = APIRouter(prefix="/frameworks", tags=["Frameworks"])
```
- `APIRouter` — a mini-FastAPI app that holds a group of related routes
- `prefix="/frameworks"` — all routes in this router start with `/frameworks`
- `tags=["Frameworks"]` — groups these routes in the Swagger UI under "Frameworks"

When `main.py` does `app.include_router(frameworks.router, prefix="/api")`, the final paths are:
- `GET /api/frameworks/`
- `POST /api/frameworks/`
- `GET /api/frameworks/{framework_id}`

```python
@router.get("/", response_model=list[FrameworkResponse])
def list_frameworks(db: Session = Depends(get_db)):
    return db.query(Framework).all()
```
- `@router.get("/")` — handle GET requests to `/frameworks/`
- `response_model=list[FrameworkResponse]` — FastAPI will serialize the return value using this
  schema. Each Framework object is converted to a FrameworkResponse dict.
- `db: Session = Depends(get_db)` — FastAPI calls `get_db()` before the function runs,
  injects the session as `db`, and calls `db.close()` after the function returns
- `db.query(Framework).all()` — SQLAlchemy: `SELECT * FROM frameworks` → list of Framework objects

```python
@router.post("/", response_model=FrameworkResponse, status_code=201)
def create_framework(payload: FrameworkCreate, db: Session = Depends(get_db)):
```
- `status_code=201` — HTTP 201 Created (not 200 OK) for successful resource creation
- `payload: FrameworkCreate` — FastAPI reads the request body JSON and validates it as
  `FrameworkCreate`. If validation fails, it returns HTTP 422 Unprocessable Entity automatically.

```python
    framework = Framework(**payload.model_dump())
```
- `payload.model_dump()` — converts the Pydantic model to a dictionary: `{"name": "SOC2", "description": "..."}`
- `Framework(**dict)` — creates a SQLAlchemy Framework object with those attribute values
- The `**` unpacks the dict as keyword arguments: `Framework(name="SOC2", description="...")`

```python
    db.add(framework)
    db.commit()
    db.refresh(framework)
    return framework
```
- `db.add(framework)` — stages the new object for insertion (no SQL sent yet)
- `db.commit()` — executes `INSERT INTO frameworks ...` and commits the transaction
- `db.refresh(framework)` — re-reads the row from the database, populating `framework.id`
  (which was set by `autoincrement` during the INSERT) and any server defaults
- `return framework` — FastAPI uses `response_model` to convert this to JSON

```python
@router.get("/{framework_id}", response_model=FrameworkResponse)
def get_framework(framework_id: int, db: Session = Depends(get_db)):
    framework = db.query(Framework).filter(Framework.id == framework_id).first()
    if not framework:
        raise HTTPException(status_code=404, detail="Framework not found")
    return framework
```
- `/{framework_id}` — path parameter. FastAPI extracts the integer from the URL.
- `filter(Framework.id == framework_id)` — SQL: `WHERE id = ?`
- `.first()` — returns the first row or `None`
- `HTTPException(status_code=404, ...)` — FastAPI catches this and returns a 404 response with
  `{"detail": "Framework not found"}` as the body

---

## 7. Create `app/api/routes/controls.py`

```python
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
```

**New concept — Query parameters:**

```python
framework_id: int | None = Query(default=None),
```
`Query(default=None)` declares a URL query parameter.
The client can call:
- `GET /api/controls/` — returns all controls
- `GET /api/controls/?framework_id=1` — returns only controls for framework 1

```python
query = db.query(Control)
if framework_id:
    query = query.filter(Control.framework_id == framework_id)
return query.all()
```
Builds the query step by step:
- Start with `SELECT * FROM controls`
- If `framework_id` was provided, add `WHERE framework_id = ?`
- Execute and return all matching rows

This is used by the frontend's SubmitEvidence page: when you pick a framework, it fetches
only the controls for that framework.

---

## 8. Create `app/api/routes/submissions.py`

```python
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
```

---

## 9. Register Routers in `main.py`

Now uncomment (or add) the router imports and registrations in `main.py`:

```python
from app.api.routes import frameworks, controls, evidence, submissions

app.include_router(frameworks.router, prefix="/api")
app.include_router(controls.router, prefix="/api")
app.include_router(evidence.router, prefix="/api")
app.include_router(submissions.router, prefix="/api")
```

> The `evidence` router is created in Stage 06. For now you can omit it.

---

## 10. Verify in Swagger UI

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` — you should see all route groups listed.

**Test via Swagger UI:**

1. `POST /api/frameworks/` with body `{"name": "SOC2", "description": "Service Org Control 2"}`
   → should return `201` with `id: 1`

2. `GET /api/frameworks/` → should return `[{"id": 1, "name": "SOC2", ...}]`

3. `POST /api/controls/` with body:
   ```json
   {"framework_id": 1, "control_ref": "CC6.1", "title": "Logical Access Controls"}
   ```
   → should return `201` with `id: 1`

4. `GET /api/controls/?framework_id=1` → should return only controls for SOC2

---

## 11. How FastAPI Auto-Validates

When you send a bad request, FastAPI catches it before your code runs:

```
POST /api/frameworks/
Body: {"name": 123}    ← name is a number, not a string

Response 422:
{
  "detail": [
    {
      "type": "string_type",
      "loc": ["body", "name"],
      "msg": "Input should be a valid string",
      ...
    }
  ]
}
```

You did not write any validation code — Pydantic handles it via the type hints.

```
POST /api/frameworks/
Body: {}    ← name is missing

Response 422:
{
  "detail": [{"msg": "Field required", "loc": ["body", "name"], ...}]
}
```

---

## 12. Next Stage

The frameworks, controls, and submissions routes work.
Move on to [stage-06-file-storage.md](stage-06-file-storage.md) to add file upload support
to the evidence route (which is more complex than JSON routes because it uses multipart form data).
