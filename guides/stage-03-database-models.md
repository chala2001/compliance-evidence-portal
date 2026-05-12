# Stage 03 — Database Models (Phase 2a)

In this stage you create the four SQLAlchemy model classes that map to database tables.
You write Python — SQLAlchemy and Alembic translate it to SQL.

At the end of this stage the models exist in Python. The actual database tables are not created
yet — that happens in Stage 04 (Alembic migrations).

---

## 1. What Is an ORM?

An **ORM (Object-Relational Mapper)** lets you work with a database using Python objects
instead of raw SQL strings.

**Without ORM (raw SQL):**
```python
cursor.execute("SELECT * FROM frameworks WHERE id = ?", (framework_id,))
row = cursor.fetchone()
# row is a tuple: (1, "SOC2", "Service Organization Control 2")
name = row[1]   # you must know the column index
```

**With SQLAlchemy ORM:**
```python
framework = db.query(Framework).filter(Framework.id == framework_id).first()
name = framework.name   # attribute access by column name
```

Advantages:
- Auto-completes in your IDE (Python knows the attribute names and types)
- Portable — switch from SQLite to PostgreSQL without changing your Python code
- Relationships work as Python attributes (`framework.controls` gives you all controls)

---

## 2. SQLAlchemy's `Mapped[]` Syntax (Modern Style)

SQLAlchemy 2.0 introduced a typed declarative syntax using Python type hints.
This is what the project uses (not the older `Column()` style).

```python
class Framework(Base):
    __tablename__ = "frameworks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
```

- `Mapped[int]` — declares the Python type of this column
- `mapped_column(...)` — sets SQL-level constraints (primary key, max length, nullability)
- Together they give SQLAlchemy full information to generate the `CREATE TABLE` SQL

**Why this is better than the old style:**
```python
# Old (SQLAlchemy 1.x)
id = Column(Integer, primary_key=True)    # no type hint — IDE can't help you
name = Column(String(50), nullable=False) # same

# New (SQLAlchemy 2.x)
id: Mapped[int] = mapped_column(primary_key=True)     # IDE knows this is int
name: Mapped[str] = mapped_column(String(50))         # IDE knows this is str
```

---

## 3. Create `app/models/framework.py`

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

**Line-by-line explanation:**

```python
from sqlalchemy import String
```
Import the `String` type for character column definitions. SQLAlchemy maps `String(50)` to
`VARCHAR(50)` in SQL.

```python
from sqlalchemy.orm import Mapped, mapped_column, relationship
```
- `Mapped` — the type annotation wrapper for column declarations
- `mapped_column` — the function that sets SQL constraints for a column
- `relationship` — declares a Python-level link between two tables (no SQL column added)

```python
from app.database import Base
```
The `Base` class defined in `database.py`. All models must inherit from it.
SQLAlchemy tracks all models that inherit from `Base` via `Base.metadata`.

```python
class Framework(Base):
    __tablename__ = "frameworks"
```
`__tablename__` tells SQLAlchemy which SQL table this class maps to.
When Alembic generates migrations, it uses this name for `CREATE TABLE frameworks ...`.

```python
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
```
- `Mapped[int]` — Python type: integer
- `primary_key=True` — SQL: `PRIMARY KEY` constraint
- `autoincrement=True` — the database assigns sequential IDs (1, 2, 3...) automatically
- You never set `id` manually; the database handles it

```python
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
```
- `String(50)` — SQL: `VARCHAR(50)` — max 50 characters
- `unique=True` — SQL: `UNIQUE` constraint — no two frameworks can have the same name
- `nullable=False` — SQL: `NOT NULL` — every row must have a name

```python
    description: Mapped[str] = mapped_column(String(500), nullable=True)
```
`nullable=True` means this column can be `NULL` (no description is optional).

```python
    controls: Mapped[list["Control"]] = relationship("Control", back_populates="framework")
```
This is **not a database column** — it's a Python-level relationship.
- `Mapped[list["Control"]]` — when accessed, returns a list of `Control` objects
- `relationship("Control", ...)` — tells SQLAlchemy to load related Control rows
- `back_populates="framework"` — creates a bidirectional link:
  - `framework.controls` → list of all controls for this framework
  - `control.framework` → the parent framework object

The string `"Control"` (in quotes) is a forward reference — `Control` is defined in another
file and not yet imported. SQLAlchemy resolves these lazily.

---

## 4. Create `app/models/control.py`

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

**New concepts:**

```python
from sqlalchemy import String, ForeignKey
```
`ForeignKey` declares a column that references another table's column.

```python
    framework_id: Mapped[int] = mapped_column(ForeignKey("frameworks.id"), nullable=False)
```
- This is a real database column (an integer that stores the ID of the parent framework)
- `ForeignKey("frameworks.id")` — SQL: `FOREIGN KEY (framework_id) REFERENCES frameworks(id)`
- This enforces referential integrity: you can't create a control for a framework that doesn't exist
- The string `"frameworks.id"` uses the table name (not the Python class name)

```python
    control_ref: Mapped[str] = mapped_column(String(50), nullable=False)
```
Stores a short code like "CC6.1" or "Req 8.2". Max 50 characters, required.

```python
    framework: Mapped["Framework"] = relationship("Framework", back_populates="controls")
```
The reverse side of the relationship defined in `Framework.controls`.
`control.framework` gives you the full Framework object, not just the `framework_id` integer.

```python
    evidence: Mapped[list["Evidence"]] = relationship("Evidence", back_populates="control")
```
Links to evidence items. `control.evidence` gives you a list of Evidence objects for this control.

---

## 5. Create `app/models/evidence.py`

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

**New concepts:**

```python
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, func
```
- `datetime` — Python's built-in datetime type
- `DateTime` — SQLAlchemy's datetime column type
- `func` — SQL function expressions (e.g., `func.now()` generates SQL `NOW()`)

```python
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```
- `Mapped[datetime]` — Python type annotation: this attribute is a datetime
- `DateTime` — the SQL column type
- `server_default=func.now()` — the **database server** automatically sets this to the current
  timestamp when a new row is inserted. You never need to set it in Python.

The difference between `server_default` and `default`:
- `server_default` → the database sets it (SQL: `DEFAULT NOW()`)
- `default` → Python sets it before sending the INSERT to the database

`server_default` is preferred for timestamps because it's timezone-consistent with the DB server.

```python
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
```
`onupdate=func.now()` — every time this row is UPDATEd, SQLAlchemy automatically sets
`updated_at` to the current time. Together with `server_default`, this gives you:
- `created_at` = set once on INSERT, never changes
- `updated_at` = set on INSERT, updated on every UPDATE

```python
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str] = mapped_column(String(1000), nullable=False)
```
- `file_name` — the actual filename on disk, e.g. `3f4a1b2c-uuid.png`
- `file_url` — the URL path to access the file, e.g. `/uploads/3f4a1b2c-uuid.png`

They're stored separately so you can change the storage backend (from local to Azure Blob)
by updating only `file_url` without breaking the physical file lookup.

---

## 6. Create `app/models/submission.py`

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

**New concept:**

```python
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
```
- `default="pending"` — Python-level default. When you create a `Submission()` without
  specifying `status`, SQLAlchemy sets it to `"pending"` before inserting into the database.
- This is a Python default (not `server_default`) because the value is known at the application
  level, not just the database level.
- Valid values: `"pending"`, `"approved"`, `"rejected"`

---

## 7. The Relationship Map

Here is how all four models connect:

```
Framework  ←──────────────── Control ←──────────────── Evidence ←────── Submission
    │                            │                          │                 │
framework.controls          control.framework          evidence.control  submission.evidence
(list of Controls)       (parent Framework)         (parent Control)   (parent Evidence)
                         control.evidence
                         (list of Evidence)
                         evidence.submissions
                         (list of Submissions)
```

Every `←` relationship is bidirectional because of `back_populates`.

---

## 8. What These Models Don't Do (Yet)

At this stage the models are just Python class definitions.
They do **not**:
- Create any tables in the database
- Validate input data for the API
- Handle file uploads

Table creation is done by Alembic migrations in Stage 04.
API validation is done by Pydantic schemas in Stage 05.
File handling is done by the storage layer in Stage 06.

---

## 9. Understanding the Import Chain

When FastAPI starts, Python imports `main.py`, which imports `routes/`, which imports `models/`.
`models/` imports `database.py` which imports `config.py` which reads `.env`.

This chain means:
1. `.env` must exist before starting the server
2. The database URL in `.env` must be valid

For development, these are the files that must exist before `uvicorn` starts:
- `backend/.env` with `DATABASE_URL`
- All `__init__.py` files
- `config.py`, `database.py`, `main.py`
- All model files

---

## 10. Next Stage

The models are defined but tables don't exist in the database yet.
Move on to [stage-04-alembic-migrations.md](stage-04-alembic-migrations.md) to generate and run
the migration that creates the four tables.
