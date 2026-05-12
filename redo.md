# Redo Guide — Rebuild to the Current State from Scratch

This file tells you exactly what your teammate built and gives you every command and every file
needed to rebuild the project to its current state on your own machine. Follow it top to bottom.

---

## 1. What Was Built So Far

The project is split into **phases**. Phases 1–5 are complete. Phase 6 (AI Agent) is scaffolded
in the frontend but not yet wired to a real backend.

| Phase | What It Does | Status |
|---|---|---|
| 1 | FastAPI backend foundation — config, database, CORS, health endpoint | ✅ Done |
| 2 | SQLAlchemy database models + Alembic migrations | ✅ Done |
| 3 | API routes for frameworks, controls, evidence, submissions | ✅ Done |
| 4 | Local file storage — save/delete files, serve uploads | ✅ Done |
| 5 | React + TypeScript frontend — 5 pages, API client, global styles | ✅ Done |
| 6 | AI agent (browser-use + Playwright + LLM) | 🔲 Not yet built |

---

## 2. Current Folder Structure

```
Compliance-Evidence-Submission-Portal/
├── .gitignore
├── docker-compose.yml          ← PostgreSQL for production (optional)
├── full-details.md             ← Full technical reference doc
├── redo.md                     ← This file
├── guides/                     ← Step-by-step build guides
│
├── backend/
│   ├── .env                    ← NOT committed — you must create this
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── uploads/                ← Created automatically by the app
│   │
│   ├── alembic/
│   │   ├── env.py
│   │   ├── README
│   │   ├── script.py.mako
│   │   └── versions/
│   │       └── 57b39d9adcfc_initial_tables.py
│   │
│   └── app/
│       ├── __init__.py
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── models/
│       │   ├── __init__.py
│       │   ├── framework.py
│       │   ├── control.py
│       │   ├── evidence.py
│       │   └── submission.py
│       ├── schemas/
│       │   ├── __init__.py
│       │   ├── framework.py
│       │   ├── control.py
│       │   ├── evidence.py
│       │   └── submission.py
│       ├── api/
│       │   ├── __init__.py
│       │   └── routes/
│       │       ├── __init__.py
│       │       ├── frameworks.py
│       │       ├── controls.py
│       │       ├── evidence.py
│       │       └── submissions.py
│       └── storage/
│           ├── __init__.py
│           └── local_storage.py
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.app.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    ├── eslint.config.js
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── App.css               ← default Vite file, not used
        ├── api/
        │   └── client.ts
        ├── components/
        │   └── Navbar.tsx
        └── pages/
            ├── Dashboard.tsx
            ├── EvidenceList.tsx
            ├── SubmitEvidence.tsx
            ├── SubmissionHistory.tsx
            └── AgentRunner.tsx
```

---

## 3. Prerequisites

You need these installed on your machine before you start:

| Tool | Check Command | Install If Missing |
|---|---|---|
| Python 3.11+ | `python3.11 --version` | `sudo apt install python3.11 python3.11-venv` |
| pip | `pip3 --version` | comes with Python |
| Node.js 20+ | `node --version` | `sudo apt install nodejs` or use nvm |
| npm | `npm --version` | comes with Node.js |
| git | `git --version` | `sudo apt install git` |

Docker is optional — only needed if you want PostgreSQL instead of SQLite.

---

## 4. Step 1 — Create the Backend Folder Structure

Run all of these commands from the `backend/` directory. They create every empty directory and
every `__init__.py` file that Python needs.

```bash
# Start from the project root
cd /path/to/Compliance-Evidence-Submission-Portal

# Create every directory
mkdir -p backend/app/models
mkdir -p backend/app/schemas
mkdir -p backend/app/api/routes
mkdir -p backend/app/storage
mkdir -p backend/uploads

# Create all empty __init__.py files (Python needs these to treat folders as packages)
touch backend/app/__init__.py
touch backend/app/models/__init__.py
touch backend/app/schemas/__init__.py
touch backend/app/api/__init__.py
touch backend/app/api/routes/__init__.py
touch backend/app/storage/__init__.py
```

---

## 5. Step 2 — Create the Python Virtual Environment

A virtual environment is an isolated Python installation for this project.
It keeps packages separate from your system Python.

```bash
cd backend

# Create the virtual environment in a folder called venv
python3.11 -m venv venv

# Activate it — your terminal prompt should show (venv) after this
source venv/bin/activate

# Verify you're using the right Python
python --version    # should show 3.11.x
which python        # should show .../backend/venv/bin/python
```

> Every time you open a new terminal to work on the backend, run `source venv/bin/activate` first.

---

## 6. Step 3 — Install Python Packages

```bash
# Make sure venv is activated first
source venv/bin/activate

# Install all required packages
pip install fastapi uvicorn sqlalchemy alembic psycopg2-binary \
  python-dotenv pydantic-settings python-multipart
```

**What each package does:**
- `fastapi` — the web framework
- `uvicorn` — the ASGI server that runs FastAPI
- `sqlalchemy` — the ORM (database toolkit)
- `alembic` — database migration tool (works with SQLAlchemy)
- `psycopg2-binary` — PostgreSQL driver (needed even when using SQLite, for production later)
- `python-dotenv` — loads `.env` files into environment variables
- `pydantic-settings` — reads config from environment variables with type validation
- `python-multipart` — required by FastAPI for file upload forms

---

## 7. Step 4 — Create the `.env` File

The `.env` file holds secret config that is never committed to git.
Create it manually:

```bash
# You are inside backend/
nano .env
```

Paste this content:

```
DATABASE_URL=sqlite:///./compliance.db
```

Save and close (`Ctrl+O`, `Enter`, `Ctrl+X` in nano).

> For production with PostgreSQL you would change this to:
> `DATABASE_URL=postgresql://complianceuser:compliancepass@localhost:5432/compliance_db`

---

## 8. Step 5 — Create All Backend Python Files

### `backend/app/config.py`

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str

    class Config:
        env_file = ".env"


settings = Settings()
```

### `backend/app/database.py`

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### `backend/app/main.py`

```python
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.routes import frameworks, controls, evidence, submissions

app = FastAPI(title="Compliance Evidence Portal", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

app.include_router(frameworks.router, prefix="/api")
app.include_router(controls.router, prefix="/api")
app.include_router(evidence.router, prefix="/api")
app.include_router(submissions.router, prefix="/api")


@app.get("/health")
def health_check():
    return {"status": "ok"}
```

### `backend/app/models/framework.py`

```python
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Framework(Base):
    __tablename__ = "frameworks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=True)

    controls: Mapped[list["Control"]] = relationship("Control", back_populates="framework")
```

### `backend/app/models/control.py`

```python
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Control(Base):
    __tablename__ = "controls"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    framework_id: Mapped[int] = mapped_column(ForeignKey("frameworks.id"), nullable=False)
    control_ref: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), nullable=True)

    framework: Mapped["Framework"] = relationship("Framework", back_populates="controls")
    evidence: Mapped[list["Evidence"]] = relationship("Evidence", back_populates="control")
```

### `backend/app/models/evidence.py`

```python
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(1000), nullable=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    control_id: Mapped[int] = mapped_column(ForeignKey("controls.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    control: Mapped["Control"] = relationship("Control", back_populates="evidence")
    submissions: Mapped[list["Submission"]] = relationship("Submission", back_populates="evidence")
```

### `backend/app/models/submission.py`

```python
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    evidence_id: Mapped[int] = mapped_column(ForeignKey("evidence.id"), nullable=False)
    submitted_by: Mapped[str] = mapped_column(String(255), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    notes: Mapped[str] = mapped_column(String(1000), nullable=True)

    evidence: Mapped["Evidence"] = relationship("Evidence", back_populates="submissions")
```

### `backend/app/schemas/framework.py`

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

### `backend/app/schemas/control.py`

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

### `backend/app/schemas/evidence.py`

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

### `backend/app/schemas/submission.py`

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

### `backend/app/api/routes/frameworks.py`

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

### `backend/app/api/routes/controls.py`

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

### `backend/app/api/routes/evidence.py`

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

### `backend/app/api/routes/submissions.py`

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

### `backend/app/storage/local_storage.py`

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

---

## 9. Step 6 — Set Up Alembic (Database Migrations)

Alembic was already initialized in the repo (`alembic/` folder and `alembic.ini` exist).
The migration file also already exists. You only need to:

**A) Fix `alembic.ini` for SQLite**

Open `backend/alembic.ini` and find this line:

```
sqlalchemy.url = postgresql://complianceuser:compliancepass@localhost:5432/compliance_db
```

Change it to:

```
sqlalchemy.url = sqlite:///./compliance.db
```

Save the file.

**B) Update `backend/alembic/env.py`**

The existing `env.py` must import all models so Alembic can detect the table definitions.
Replace `backend/alembic/env.py` with this content:

```python
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

from app.database import Base
from app.models import framework, control, evidence, submission  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

**C) Run the Migration**

```bash
# Make sure you are in backend/ with venv active
cd backend
source venv/bin/activate

python -m alembic upgrade head
```

You should see output like:
```
INFO  [alembic.runtime.migration] Running upgrade  -> 57b39d9adcfc, initial tables
```

This creates `backend/compliance.db` with 4 tables: frameworks, controls, evidence, submissions.

---

## 10. Step 7 — Scaffold the Frontend

The frontend was created using the official Vite scaffolding tool.
Run this from the project root (NOT inside backend/):

```bash
# Go back to project root first
cd ..

# Scaffold a new Vite + React + TypeScript project
npm create vite@latest frontend -- --template react-ts
```

When prompted, confirm any defaults.

Then install the project's dependencies:

```bash
cd frontend
npm install

# Install the additional packages used in this project
npm install react-router-dom axios @tanstack/react-query
```

**What each package does:**
- `react-router-dom` — client-side routing (navigate between pages without page reloads)
- `axios` — HTTP client for calling the backend API
- `@tanstack/react-query` — server state management (caching, loading states, refetching)

---

## 11. Step 8 — Create All Frontend Files

After scaffolding, replace or create each file below with the exact content shown.

### `frontend/src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
```

### `frontend/src/App.tsx`

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import EvidenceList from "./pages/EvidenceList";
import SubmitEvidence from "./pages/SubmitEvidence";
import SubmissionHistory from "./pages/SubmissionHistory";
import AgentRunner from "./pages/AgentRunner";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/evidence" element={<EvidenceList />} />
          <Route path="/submit" element={<SubmitEvidence />} />
          <Route path="/history" element={<SubmissionHistory />} />
          <Route path="/agent" element={<AgentRunner />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
```

### `frontend/src/api/client.ts`

Create the folder first: `mkdir -p frontend/src/api`

```ts
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000/api",
});

export const frameworksApi = {
  list: () => api.get("/frameworks/").then((r) => r.data),
};

export const controlsApi = {
  list: (frameworkId?: number) =>
    api
      .get("/controls/", { params: frameworkId ? { framework_id: frameworkId } : {} })
      .then((r) => r.data),
};

export const evidenceApi = {
  list: () => api.get("/evidence/").then((r) => r.data),
  get: (id: number) => api.get(`/evidence/${id}`).then((r) => r.data),
  create: (formData: FormData) =>
    api.post("/evidence/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data),
  delete: (id: number) => api.delete(`/evidence/${id}`),
};

export const submissionsApi = {
  list: () => api.get("/submissions/").then((r) => r.data),
  create: (data: { evidence_id: number; submitted_by: string; notes?: string }) =>
    api.post("/submissions/", data).then((r) => r.data),
};
```

### `frontend/src/components/Navbar.tsx`

Create the folder first: `mkdir -p frontend/src/components`

```tsx
import { NavLink } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-brand">Compliance Portal</div>
      <div className="navbar-links">
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/evidence">Evidence</NavLink>
        <NavLink to="/submit">Submit</NavLink>
        <NavLink to="/history">History</NavLink>
        <NavLink to="/agent">Agent</NavLink>
      </div>
    </nav>
  );
}
```

### `frontend/src/pages/Dashboard.tsx`

Create the folder first: `mkdir -p frontend/src/pages`

```tsx
import { useQuery } from "@tanstack/react-query";
import { evidenceApi, submissionsApi, frameworksApi } from "../api/client";

export default function Dashboard() {
  const { data: evidence = [] } = useQuery({ queryKey: ["evidence"], queryFn: evidenceApi.list });
  const { data: submissions = [] } = useQuery({ queryKey: ["submissions"], queryFn: submissionsApi.list });
  const { data: frameworks = [] } = useQuery({ queryKey: ["frameworks"], queryFn: frameworksApi.list });

  return (
    <div className="page">
      <h1>Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{evidence.length}</div>
          <div className="stat-label">Total Evidence</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{submissions.length}</div>
          <div className="stat-label">Total Submissions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{frameworks.length}</div>
          <div className="stat-label">Frameworks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {submissions.filter((s: any) => s.status === "pending").length}
          </div>
          <div className="stat-label">Pending Reviews</div>
        </div>
      </div>

      <h2>Recent Submissions</h2>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Submitted By</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {submissions.slice(0, 5).map((s: any) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.submitted_by}</td>
              <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
              <td>{new Date(s.submitted_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {submissions.length === 0 && (
            <tr><td colSpan={4} className="empty">No submissions yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

### `frontend/src/pages/EvidenceList.tsx`

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { evidenceApi, frameworksApi, controlsApi } from "../api/client";

export default function EvidenceList() {
  const queryClient = useQueryClient();
  const [selectedFramework, setSelectedFramework] = useState<number | undefined>();

  const { data: evidence = [], isLoading } = useQuery({
    queryKey: ["evidence"],
    queryFn: evidenceApi.list,
  });
  const { data: frameworks = [] } = useQuery({
    queryKey: ["frameworks"],
    queryFn: frameworksApi.list,
  });
  const { data: controls = [] } = useQuery({
    queryKey: ["controls", selectedFramework],
    queryFn: () => controlsApi.list(selectedFramework),
  });

  const deleteMutation = useMutation({
    mutationFn: evidenceApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["evidence"] }),
  });

  const getControlRef = (controlId: number) => {
    const control = controls.find((c: any) => c.id === controlId);
    return control ? control.control_ref : controlId;
  };

  return (
    <div className="page">
      <h1>Evidence</h1>

      <div className="filters">
        <select
          value={selectedFramework ?? ""}
          onChange={(e) => setSelectedFramework(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All Frameworks</option>
          {frameworks.map((f: any) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>File</th>
              <th>Control</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((e: any) => (
              <tr key={e.id}>
                <td>{e.title}</td>
                <td>
                  <a href={`http://localhost:8000${e.file_url}`} target="_blank" rel="noreferrer">
                    {e.file_name}
                  </a>
                </td>
                <td>{getControlRef(e.control_id)}</td>
                <td>{new Date(e.created_at).toLocaleDateString()}</td>
                <td>
                  <button
                    className="btn btn-danger"
                    onClick={() => deleteMutation.mutate(e.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {evidence.length === 0 && (
              <tr><td colSpan={5} className="empty">No evidence found</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

### `frontend/src/pages/SubmitEvidence.tsx`

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { frameworksApi, controlsApi, evidenceApi } from "../api/client";

export default function SubmitEvidence() {
  const [frameworkId, setFrameworkId] = useState<number | undefined>();
  const [controlId, setControlId] = useState<number | undefined>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [success, setSuccess] = useState(false);

  const { data: frameworks = [] } = useQuery({
    queryKey: ["frameworks"],
    queryFn: frameworksApi.list,
  });
  const { data: controls = [] } = useQuery({
    queryKey: ["controls", frameworkId],
    queryFn: () => controlsApi.list(frameworkId),
    enabled: !!frameworkId,
  });

  const mutation = useMutation({
    mutationFn: evidenceApi.create,
    onSuccess: () => {
      setSuccess(true);
      setTitle("");
      setDescription("");
      setFile(null);
      setControlId(undefined);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !controlId) return;
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("control_id", String(controlId));
    formData.append("file", file);
    mutation.mutate(formData);
  };

  return (
    <div className="page">
      <h1>Submit Evidence</h1>

      {success && (
        <div className="alert alert-success">Evidence submitted successfully.</div>
      )}

      <form className="form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Framework</label>
          <select
            value={frameworkId ?? ""}
            onChange={(e) => { setFrameworkId(Number(e.target.value)); setControlId(undefined); }}
            required
          >
            <option value="">Select framework</option>
            {frameworks.map((f: any) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Control</label>
          <select
            value={controlId ?? ""}
            onChange={(e) => setControlId(Number(e.target.value))}
            disabled={!frameworkId}
            required
          >
            <option value="">Select control</option>
            {controls.map((c: any) => (
              <option key={c.id} value={c.id}>{c.control_ref} — {c.title}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Evidence title"
            required
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>File</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Uploading..." : "Submit Evidence"}
        </button>
      </form>
    </div>
  );
}
```

### `frontend/src/pages/SubmissionHistory.tsx`

```tsx
import { useQuery } from "@tanstack/react-query";
import { submissionsApi } from "../api/client";

export default function SubmissionHistory() {
  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["submissions"],
    queryFn: submissionsApi.list,
  });

  return (
    <div className="page">
      <h1>Submission History</h1>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Evidence ID</th>
              <th>Submitted By</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s: any) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.evidence_id}</td>
                <td>{s.submitted_by}</td>
                <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                <td>{s.notes ?? "—"}</td>
                <td>{new Date(s.submitted_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {submissions.length === 0 && (
              <tr><td colSpan={6} className="empty">No submissions yet</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

### `frontend/src/pages/AgentRunner.tsx`

```tsx
import { useState } from "react";

export default function AgentRunner() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [log, setLog] = useState<string[]>([]);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setStatus("running");
    setLog(["Agent started...", `Prompt: ${prompt}`]);

    // Placeholder — agent API will be wired in Phase 6
    setTimeout(() => {
      setLog((prev) => [...prev, "Agent execution not yet implemented.", "This will be wired up in Phase 6."]);
      setStatus("done");
    }, 1500);
  };

  return (
    <div className="page">
      <h1>AI Agent Runner</h1>
      <p className="subtitle">
        Describe what evidence to collect and the agent will navigate the portal automatically.
      </p>

      <form className="form" onSubmit={handleRun}>
        <div className="form-group">
          <label>Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder='e.g. "Go to Azure Portal, navigate to Key Vault X, take a screenshot of the access policy, and upload it to control CC6.1"'
            required
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={status === "running"}
        >
          {status === "running" ? "Running..." : "Run Agent"}
        </button>
      </form>

      {log.length > 0 && (
        <div className="agent-log">
          <h3>Agent Log</h3>
          <div className="log-box">
            {log.map((line, i) => (
              <div key={i} className="log-line">{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### `frontend/src/index.css`

Replace the default Vite CSS with this:

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f4f6f9;
  color: #1a1a2e;
}

.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1a1a2e;
  padding: 0 2rem;
  height: 60px;
  position: sticky;
  top: 0;
  z-index: 100;
}

.navbar-brand {
  color: #fff;
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 0.5px;
}

.navbar-links {
  display: flex;
  gap: 1.5rem;
}

.navbar-links a {
  color: #a0aec0;
  text-decoration: none;
  font-size: 0.9rem;
  padding: 0.4rem 0;
  border-bottom: 2px solid transparent;
  transition: color 0.2s, border-color 0.2s;
}

.navbar-links a:hover,
.navbar-links a.active {
  color: #fff;
  border-bottom-color: #4f8ef7;
}

.main-content {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.page h1 {
  font-size: 1.6rem;
  margin-bottom: 1.5rem;
  color: #1a1a2e;
}

.page h2 {
  font-size: 1.1rem;
  margin: 1.5rem 0 0.75rem;
  color: #2d3748;
}

.subtitle {
  color: #718096;
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #4f8ef7;
}

.stat-label {
  font-size: 0.85rem;
  color: #718096;
  margin-top: 0.25rem;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.table th {
  background: #f7fafc;
  text-align: left;
  padding: 0.75rem 1rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #718096;
  border-bottom: 1px solid #e2e8f0;
}

.table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f0f4f8;
  font-size: 0.9rem;
}

.table tr:last-child td {
  border-bottom: none;
}

.table a {
  color: #4f8ef7;
  text-decoration: none;
}

.empty {
  text-align: center;
  color: #a0aec0;
  padding: 2rem !important;
}

.badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 99px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: capitalize;
}

.badge-pending  { background: #fef3c7; color: #92400e; }
.badge-approved { background: #d1fae5; color: #065f46; }
.badge-rejected { background: #fee2e2; color: #991b1b; }

.form {
  background: #fff;
  border-radius: 8px;
  padding: 2rem;
  max-width: 560px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.4rem;
  color: #2d3748;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
  color: #1a1a2e;
  background: #fff;
  outline: none;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  border-color: #4f8ef7;
}

.btn {
  padding: 0.55rem 1.25rem;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary  { background: #4f8ef7; color: #fff; }
.btn-primary:hover:not(:disabled) { opacity: 0.88; }
.btn-danger   { background: #fee2e2; color: #991b1b; }
.btn-danger:hover:not(:disabled)  { background: #fecaca; }

.filters {
  margin-bottom: 1rem;
}

.filters select {
  padding: 0.45rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.9rem;
  background: #fff;
}

.alert {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1.25rem;
  font-size: 0.9rem;
}

.alert-success { background: #d1fae5; color: #065f46; }

.agent-log {
  margin-top: 2rem;
}

.agent-log h3 {
  font-size: 1rem;
  margin-bottom: 0.5rem;
  color: #2d3748;
}

.log-box {
  background: #1a1a2e;
  border-radius: 8px;
  padding: 1rem 1.25rem;
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: 0.85rem;
}

.log-line {
  color: #a0f0a0;
  padding: 0.15rem 0;
}
```

---

## 12. Step 9 — Root Files

### `.gitignore` (project root)

```
# Python
__pycache__/
*.py[cod]
venv/
.venv/
*.env
.env

# Node
node_modules/

# OS
.DS_Store

# Logs
*.log
```

### `docker-compose.yml` (project root, optional)

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: complianceuser
      POSTGRES_PASSWORD: compliancepass
      POSTGRES_DB: compliance_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

## 13. Step 10 — Run and Verify

Open **two terminals**.

**Terminal 1 — Backend:**

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm run dev
```

You should see:
```
  VITE v6.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

**Verify these URLs work:**

| URL | Expected Result |
|---|---|
| `http://localhost:8000/health` | `{"status":"ok"}` |
| `http://localhost:8000/docs` | Swagger UI showing all API endpoints |
| `http://localhost:5173` | React app with Navbar and Dashboard |

---

## 14. Quick Smoke Test — Seed Some Data

Use the Swagger UI at `http://localhost:8000/docs` to create test data:

1. **POST /api/frameworks/** — body: `{"name": "SOC2", "description": "Service Organization Control 2"}`
2. **POST /api/controls/** — body: `{"framework_id": 1, "control_ref": "CC6.1", "title": "Logical Access Controls"}`
3. Go to `http://localhost:5173/submit`, select SOC2 → CC6.1, upload any file
4. Go to `http://localhost:5173` — Dashboard should show counts

---

## 15. What Still Needs to Be Built (Phase 6)

The AI Agent layer is the next phase. See `guides/stage-08-ai-agent.md` for the full guide.
At a high level, Phase 6 requires:

- Installing `browser-use` and `playwright` Python packages
- Creating `backend/app/agent/runner.py` (the agent execution logic)
- Creating `backend/app/api/routes/agent.py` (the API endpoint)
- Registering the agent router in `main.py`
- Updating `AgentRunner.tsx` to call the real API instead of the placeholder timeout
- An LLM API key (Gemini is free-tier, Ollama is fully local)
