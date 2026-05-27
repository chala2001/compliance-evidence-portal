# Stage 04 — Alembic Migrations (Phase 2b)

In this stage you learn what database migrations are, set up Alembic, and run the migration that
creates the four database tables.

At the end of this stage `backend/compliance.db` exists with all four tables inside it.

---

## 1. What Are Database Migrations?

When your application is in production, the database has real data.
You can't just drop the table and recreate it when you need to change the schema.

**Migrations** are versioned SQL change scripts that evolve the schema safely:
- Add a column without deleting existing rows
- Rename a column while preserving data
- Roll back a bad migration without manually writing reverse SQL

Alembic is the migration tool for SQLAlchemy. It:
1. Compares your Python models against the current database schema
2. Generates `upgrade()` and `downgrade()` functions (SQL operations)
3. Tracks which migrations have been applied in a `alembic_version` table inside your database

### Why not just use `Base.metadata.create_all(engine)`?

`create_all()` creates missing tables but **never modifies existing ones**.
If you add a column to a model after the table already exists, `create_all()` does nothing.
Alembic detects the difference and generates `op.add_column(...)`.

For the current project, `create_all()` would technically work (no production data yet),
but learning migrations now means you use the right tool from the start.

---

## 2. Initialize Alembic

Run this command from inside `backend/`:

```bash
cd backend
source venv/bin/activate
python -m alembic init alembic
```

**What this does:**
- Creates `backend/alembic/` directory
- Inside it: `env.py`, `script.py.mako`, `README`
- Creates `backend/alembic/versions/` (empty — migrations go here)
- Creates `backend/alembic.ini` (Alembic configuration file)

> **Note:** If you cloned the repo, these files already exist. Skip the `init` command and go
> directly to "Configure alembic.ini" below.

---

## 3. Configure `alembic.ini`

Open `backend/alembic.ini` and find this line:

```ini
sqlalchemy.url = driver://user:pass@localhost/dbname
```

Change it to:

```ini
sqlalchemy.url = postgresql://complianceuser:compliancepass@localhost:5432/compliance_db
```

**Why:** This is the fallback URL Alembic reads if `env.py` doesn't override it.
In practice, `env.py` overrides it using the `DATABASE_URL` from your `.env` file
(see Section 4 below), so this line rarely matters — but it must be a valid placeholder.

> **Note:** This project uses PostgreSQL exclusively (no SQLite). Start the database with
> `docker-compose up -d` before running migrations.

---

## 4. Configure `alembic/env.py`

The `env.py` file is the bridge between Alembic and your SQLAlchemy models.
It must import your `Base` and all models so Alembic can compare them to the database.

Replace `backend/alembic/env.py` with:

```python
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

from app.database import Base
from app.models import framework, control, evidence, submission  # noqa: F401
from app.config import settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

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

**Line-by-line explanation of the key parts:**

```python
from app.database import Base
from app.models import framework, control, evidence, submission  # noqa: F401
from app.config import settings
```
These imports are critical.

- `Base` carries `Base.metadata` — a registry of every table defined in your models
- The model imports trigger Python to load each model class, registering it with `Base.metadata`
- `settings` is imported to read `DATABASE_URL` from `.env`
- `# noqa: F401` — tells linters not to warn about "imported but unused"

```python
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
```
Overrides the `sqlalchemy.url` in `alembic.ini` with the value from your `.env` file.
This means you only need to update `DATABASE_URL` in `.env` — no need to keep `alembic.ini` in sync.

```python
target_metadata = Base.metadata
```
Tells Alembic: "this is what the schema SHOULD look like." Alembic compares this against
the current database to decide what SQL to generate.

```python
def run_migrations_offline() -> None:
```
Runs migrations without connecting to the database — just generates SQL statements.
Used to preview what SQL would be executed (useful for review before running in production).

```python
def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
```
Reads the `sqlalchemy.url` from `alembic.ini` and creates a database connection.
`pool.NullPool` means no connection pooling — each migration gets a fresh connection
(best for migration scripts that run once and exit).

```python
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```
Chooses which mode to run. `alembic upgrade head` triggers online mode.
`alembic upgrade head --sql` triggers offline mode (generates SQL to stdout).

---

## 5. Generate the Migration

```bash
cd backend
source venv/bin/activate
python -m alembic revision --autogenerate -m "initial tables"
```

**What this command does:**
- `revision` — create a new migration file
- `--autogenerate` — compare `target_metadata` (your Python models) to the current database
  (empty at this point), and generate the SQL operations needed
- `-m "initial tables"` — the message that becomes part of the filename

**Expected output:**
```
INFO  [alembic.autogenerate.compare] Detected added table 'frameworks'
INFO  [alembic.autogenerate.compare] Detected added table 'controls'
INFO  [alembic.autogenerate.compare] Detected added table 'evidence'
INFO  [alembic.autogenerate.compare] Detected added table 'submissions'
Generating .../alembic/versions/57b39d9adcfc_initial_tables.py ...  done
```

A file is created in `alembic/versions/` with a random hex prefix.

> **Note:** If you cloned the repo, this file already exists. Do NOT run `revision` again
> — you would create a duplicate. Skip directly to Step 6 "Apply the Migration".

---

## 6. Understand the Generated Migration File

Open `alembic/versions/57b39d9adcfc_initial_tables.py`:

```python
"""initial tables

Revision ID: 57b39d9adcfc
Revises: 
Create Date: 2026-05-12 10:10:33.485981

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '57b39d9adcfc'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('frameworks',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('name', sa.String(length=50), nullable=False),
    sa.Column('description', sa.String(length=500), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_table('controls',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('framework_id', sa.Integer(), nullable=False),
    sa.Column('control_ref', sa.String(length=50), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('description', sa.String(length=1000), nullable=True),
    sa.ForeignKeyConstraint(['framework_id'], ['frameworks.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('evidence',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('description', sa.String(length=1000), nullable=True),
    sa.Column('file_name', sa.String(length=255), nullable=False),
    sa.Column('file_url', sa.String(length=1000), nullable=False),
    sa.Column('control_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['control_id'], ['controls.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('submissions',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('evidence_id', sa.Integer(), nullable=False),
    sa.Column('submitted_by', sa.String(length=255), nullable=False),
    sa.Column('submitted_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('status', sa.String(length=50), nullable=False),
    sa.Column('notes', sa.String(length=1000), nullable=True),
    sa.ForeignKeyConstraint(['evidence_id'], ['evidence.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('submissions')
    op.drop_table('evidence')
    op.drop_table('controls')
    op.drop_table('frameworks')
```

**Key concepts:**

```python
revision: str = '57b39d9adcfc'
down_revision: Union[str, Sequence[str], None] = None
```
- `revision` — the unique ID for this migration
- `down_revision = None` — there is no previous migration (this is the first one)
- Future migrations would have `down_revision = '57b39d9adcfc'` pointing to this one
- Alembic uses these to form a chain: `None → 57b39d9adcfc → next_revision → ...`

```python
def upgrade() -> None:
```
This function runs when you do `alembic upgrade head`. It contains the SQL operations to
move the schema FORWARD (add tables, add columns, etc.).

```python
    op.create_table('frameworks',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    ...
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
```
Alembic translated your Python model into `op.create_table(...)` calls.
Notice:
- `sa.UniqueConstraint('name')` came from `unique=True` in your model
- `sa.ForeignKeyConstraint(['framework_id'], ['frameworks.id'])` came from `ForeignKey(...)`
- Tables are created in the right order: `frameworks` before `controls` (because controls
  references frameworks — you can't have a FK to a table that doesn't exist yet)

```python
def downgrade() -> None:
    op.drop_table('submissions')
    op.drop_table('evidence')
    op.drop_table('controls')
    op.drop_table('frameworks')
```
This function runs when you do `alembic downgrade -1` (revert one step).
Tables are dropped in reverse order — you must drop the FK-referencing tables first.

---

## 7. Apply the Migration

```bash
cd backend
source venv/bin/activate
python -m alembic upgrade head
```

**What `upgrade head` means:**
- `upgrade` — run `upgrade()` functions forward
- `head` — go to the latest migration (the "head" of the revision chain)

**Expected output:**
```
INFO  [alembic.runtime.migration] Context impl SQLiteImpl.
INFO  [alembic.runtime.migration] Will assume non-transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> 57b39d9adcfc, initial tables
```

After this command:
- All 4 tables are created inside PostgreSQL: `frameworks`, `controls`, `evidence`, `submissions`
- An `alembic_version` table is also created to track which migrations have been applied

---

## 8. Verify the Tables Were Created

```bash
# Connect to PostgreSQL and list tables
docker exec -it compliance-evidence-submission-portal-postgres-1 \
  psql -U complianceuser -d compliance_db -c "\dt"
```

Expected output:
```
 Schema |      Name       | Type  |     Owner
--------+-----------------+-------+----------------
 public | alembic_version | table | complianceuser
 public | controls        | table | complianceuser
 public | evidence        | table | complianceuser
 public | frameworks      | table | complianceuser
 public | submissions     | table | complianceuser
```

Check which migration has been applied:
```bash
cd backend && source venv/bin/activate
python -m alembic current
```

Expected output:
```
57b39d9adcfc (head)
```

---

## 9. Adding a New Column Later (How Migrations Work in Practice)

To understand the power of migrations, here is what you would do if you needed to add
a `review_deadline` column to the `submissions` table:

**Step 1 — Update the Python model:**
```python
review_deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```

**Step 2 — Generate migration:**
```bash
python -m alembic revision --autogenerate -m "add review_deadline to submissions"
```

Alembic detects the new column and generates:
```python
def upgrade() -> None:
    op.add_column('submissions', sa.Column('review_deadline', sa.DateTime(), nullable=True))

def downgrade() -> None:
    op.drop_column('submissions', 'review_deadline')
```

**Step 3 — Apply it:**
```bash
python -m alembic upgrade head
```

All existing rows get `review_deadline = NULL`. No data is lost.

---

## 10. Common Alembic Commands

| Command | What It Does |
|---|---|
| `alembic upgrade head` | Apply all pending migrations |
| `alembic downgrade -1` | Revert the most recent migration |
| `alembic downgrade base` | Revert ALL migrations (empty database) |
| `alembic current` | Show which migration is currently applied |
| `alembic history` | List all migrations in order |
| `alembic revision --autogenerate -m "..."` | Generate a new migration from model changes |

---

## 11. Next Stage

The four tables now exist in the database.
Move on to [stage-05-api-routes.md](stage-05-api-routes.md) to create the Pydantic schemas
and FastAPI route handlers that expose these tables as a REST API.
