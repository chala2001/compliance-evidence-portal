# Stage 02 — Backend Foundation (Phase 1)

This stage sets up the FastAPI application skeleton: virtual environment, package installation,
config loading, database connection, CORS, static file serving, and the health endpoint.

At the end of this stage you will have a running backend that returns `{"status": "ok"}` at
`http://localhost:8000/health`.

---

## 1. What Is a Virtual Environment?

When you install Python packages with `pip`, they normally go into your system Python installation.
This creates problems:
- Project A needs `fastapi==0.100` and Project B needs `fastapi==0.136` → conflict
- You can't cleanly uninstall one project's packages without affecting others

A **virtual environment** (`venv`) is an isolated copy of Python inside your project folder.
Packages installed in this venv don't affect your system Python or any other project.

### The rule: always activate the venv before working on the backend

```bash
cd backend
source venv/bin/activate   # (venv) appears in your terminal prompt
```

When you're done:
```bash
deactivate
```

---

## 2. Create the Project Structure

```bash
# Navigate to the project root
cd /path/to/Compliance-Evidence-Submission-Portal

# Create the backend folder hierarchy
mkdir -p backend/app/models
mkdir -p backend/app/schemas
mkdir -p backend/app/api/routes
mkdir -p backend/app/storage
mkdir -p backend/uploads
```

**Why `mkdir -p`?**
The `-p` flag means "create parent directories too and don't error if they already exist".
`mkdir -p backend/app/models` creates all three directories in one command.

### Create `__init__.py` files

Python treats a folder as a **package** only if it contains `__init__.py`.
Without it, `from app.models.framework import Framework` fails.

```bash
touch backend/app/__init__.py
touch backend/app/models/__init__.py
touch backend/app/schemas/__init__.py
touch backend/app/api/__init__.py
touch backend/app/api/routes/__init__.py
touch backend/app/storage/__init__.py
```

`touch` creates an empty file. These files are intentionally empty — their presence is the signal.

---

## 3. Create the Virtual Environment

```bash
cd backend

# Create a venv using Python 3.11
python3.11 -m venv venv
```

**What this does:**
- Creates a `backend/venv/` folder
- Inside it: a copy of Python 3.11, `pip`, and a `site-packages/` directory for your packages
- Creates `bin/activate` script that modifies your PATH to use this Python

```bash
# Activate it
source venv/bin/activate

# Verify
python --version     # should print Python 3.11.x
which python         # should print .../backend/venv/bin/python
```

---

## 4. Install Python Packages

```bash
# venv must be active
pip install fastapi uvicorn sqlalchemy alembic psycopg2-binary \
  python-dotenv pydantic-settings python-multipart
```

**What each package does:**

| Package | Role |
|---|---|
| `fastapi` | Web framework — handles HTTP routing, request parsing, response generation |
| `uvicorn` | ASGI server — runs the FastAPI app (ASGI = Async Server Gateway Interface) |
| `sqlalchemy` | ORM — maps Python classes to database tables |
| `alembic` | Database migration tool — versioned schema changes |
| `psycopg2-binary` | PostgreSQL driver (needed for production even if using SQLite in dev) |
| `python-dotenv` | Loads `.env` file values into `os.environ` |
| `pydantic-settings` | Reads config from environment variables with type validation |
| `python-multipart` | Required by FastAPI for parsing `multipart/form-data` (file uploads) |

### Save the requirements

After installing, save the package list:

```bash
pip freeze > requirements.txt
```

This writes every installed package and its version to `requirements.txt` so others can
install the exact same versions with `pip install -r requirements.txt`.

---

## 5. Create the `.env` File

The `.env` file stores secrets and environment-specific config. It is **never committed to git**.

```bash
# Inside backend/
nano .env
```

Paste:
```
DATABASE_URL=sqlite:///./compliance.db
```

**What `sqlite:///./compliance.db` means:**
- `sqlite://` — use the SQLite database driver
- `/.` — path starts from the current working directory
- `/compliance.db` — the filename

When you run `uvicorn` from inside `backend/`, this creates `backend/compliance.db`.

**Why use SQLite for development?**
SQLite is a single file — no server to start, no Docker required, zero config.
For production you switch to PostgreSQL by changing this one line.

---

## 6. Create `app/config.py`

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str

    class Config:
        env_file = ".env"


settings = Settings()
```

**Line-by-line explanation:**

```python
from pydantic_settings import BaseSettings
```
Import the base class that enables reading config from environment variables.

```python
class Settings(BaseSettings):
    DATABASE_URL: str
```
Define a config class. `DATABASE_URL: str` means:
- When `Settings()` is instantiated, look for an environment variable named `DATABASE_URL`
- If found, assign it as a string
- If not found and no default is given, raise a `ValidationError`

```python
    class Config:
        env_file = ".env"
```
Tell pydantic-settings to also look in the `.env` file when environment variables aren't set.
The `.env` file is loaded relative to where Python is run from.

```python
settings = Settings()
```
Create a single global instance. Any file that needs config imports this one object:
```python
from app.config import settings
print(settings.DATABASE_URL)  # "sqlite:///./compliance.db"
```

---

## 7. Create `app/database.py`

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

**Line-by-line explanation:**

```python
from sqlalchemy import create_engine
```
`create_engine` is SQLAlchemy's connection factory. Given a database URL string, it knows how
to connect to SQLite, PostgreSQL, MySQL, etc.

```python
from sqlalchemy.orm import sessionmaker, DeclarativeBase
```
- `sessionmaker` creates a factory for database sessions
- `DeclarativeBase` is the base class for all SQLAlchemy model classes

```python
engine = create_engine(settings.DATABASE_URL)
```
Creates the engine using the URL from `.env`. For SQLite this opens (or creates) the `.db` file.
For PostgreSQL it opens a connection pool.

```python
SessionLocal = sessionmaker(bind=engine)
```
Creates a session factory. Each call to `SessionLocal()` opens a new database session.
A session is like a "unit of work" — you query, add, and commit within one session.

```python
class Base(DeclarativeBase):
    pass
```
All SQLAlchemy model classes inherit from this. SQLAlchemy uses it to track which tables exist
in Python and how they map to the database. Alembic also uses it to detect schema changes.

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```
This is a **FastAPI dependency**. `yield` makes it a generator:
- When a route function calls `Depends(get_db)`, FastAPI calls `get_db()`
- The code before `yield` runs before the route handler
- `yield db` passes the session to the route handler
- The code after `yield` (in `finally`) runs after the route handler completes
- `finally` guarantees `db.close()` runs even if an exception is raised

This is the standard pattern for safely managing database sessions in FastAPI.

---

## 8. Create `app/main.py`

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

**Line-by-line explanation:**

```python
from pathlib import Path
```
`Path` is Python's modern file system path toolkit. It handles OS path differences (Windows vs Linux).

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
```
Import the core FastAPI class and two built-in extensions:
- `CORSMiddleware` — handles Cross-Origin Resource Sharing
- `StaticFiles` — serves files from a directory at a URL path

```python
from app.api.routes import frameworks, controls, evidence, submissions
```
Import the router modules. These don't exist yet at this stage — you add this import after
creating the routes in Stage 05. For now, comment this line out if running early.

```python
app = FastAPI(title="Compliance Evidence Portal", version="1.0.0")
```
Creates the FastAPI application instance. The `title` and `version` appear in the Swagger UI.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```
**CORS (Cross-Origin Resource Sharing)** is a browser security feature.
When your React app at `localhost:5173` makes an HTTP request to the FastAPI server at
`localhost:8000`, the browser blocks it by default because the origins differ.

This middleware tells the browser it's allowed:
- `allow_origins=["http://localhost:5173"]` — only this origin is whitelisted
- `allow_methods=["*"]` — allow GET, POST, DELETE, PUT, PATCH, etc.
- `allow_headers=["*"]` — allow any request header

```python
UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
```
`__file__` is the path to `main.py`.
- `.parent` is `app/` (the containing folder)
- `.parent.parent` is `backend/`
- `/ "uploads"` appends `/uploads` to get `backend/uploads/`

`Path` overrides the `/` operator to mean "join path segments".

```python
UPLOADS_DIR.mkdir(exist_ok=True)
```
Creates the `uploads/` directory if it doesn't exist. `exist_ok=True` means don't error if it's
already there. This ensures the directory always exists when the app starts.

```python
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
```
Mounts the `uploads/` folder at the `/uploads` URL path.
Any file at `backend/uploads/photo.png` is now accessible at `http://localhost:8000/uploads/photo.png`.
This is how evidence files are served to the frontend.

```python
app.include_router(frameworks.router, prefix="/api")
```
Registers the frameworks router. All routes defined inside `frameworks.router` get the `/api`
prefix prepended. So a route defined as `GET /frameworks/` becomes `GET /api/frameworks/`.

```python
@app.get("/health")
def health_check():
    return {"status": "ok"}
```
A simple health check endpoint. FastAPI automatically converts the returned dictionary to JSON.
Useful for deployment health checks and verifying the server is running.

---

## 9. Verify at This Stage

At this point, comment out the router imports in `main.py` (they don't exist yet):

```python
# from app.api.routes import frameworks, controls, evidence, submissions
# app.include_router(frameworks.router, prefix="/api")
# app.include_router(controls.router, prefix="/api")
# app.include_router(evidence.router, prefix="/api")
# app.include_router(submissions.router, prefix="/api")
```

Then run:

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**What `uvicorn app.main:app --reload --port 8000` means:**
- `app.main` — Python module path: the `main.py` file inside the `app/` package
- `:app` — the variable name of the FastAPI instance inside that module
- `--reload` — restart the server whenever you save a file (development mode only)
- `--port 8000` — listen on port 8000

Open `http://localhost:8000/health` — you should see:
```json
{"status": "ok"}
```

Open `http://localhost:8000/docs` — you should see the Swagger UI with just the health endpoint.

---

## 10. Key Concepts Summary

| Concept | What It Is |
|---|---|
| `venv` | Isolated Python environment — packages live here, not in system Python |
| `.env` file | Key=value config file loaded at runtime, never committed to git |
| `pydantic-settings` | Reads `.env` into a typed Python class |
| `SQLAlchemy engine` | The connection to the database |
| `SessionLocal` | Factory for creating database sessions |
| `Base` | Parent class all SQLAlchemy models inherit from |
| `get_db()` | FastAPI dependency that opens/closes a DB session per request |
| CORS | Browser security that requires backend permission for cross-origin requests |
| `StaticFiles` | Serves a folder of files at a URL path |
| `include_router` | Registers a group of related routes with a shared prefix |

---

## 11. Next Stage

Move on to [stage-03-database-models.md](stage-03-database-models.md) to define the four database
tables as Python classes using SQLAlchemy's modern `Mapped[]` syntax.
