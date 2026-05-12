# Stage 01 — Project Overview

Before writing a single line of code, understand **what** you are building, **why** it is structured
the way it is, and **how** all the pieces connect. This stage has no commands — it is pure reading.

---

## 1. What Is This Project?

WSO2 must regularly prove to auditors that its internal security controls are being followed.
This is called **compliance evidence collection**.

### The Current (Manual) Process

An engineer:
1. Opens Azure Portal / AWS Console / ServiceNow
2. Navigates to the relevant settings page
3. Takes a screenshot or exports a config file
4. Emails it or uploads it to Confluence with a note like "CC6.1 — Key Vault policy — 2026-05-12"

This takes hours per audit cycle, has no central record, and is error-prone.

### The Solution

A web application with two layers:

**Layer 1 — Evidence Portal**
A web UI where engineers upload evidence files, map them to compliance controls,
and see a full audit trail of who submitted what.

**Layer 2 — AI Agent**
An LLM-powered agent that accepts a natural language prompt like:
> "Go to Azure Portal, navigate to Key Vault X, take a screenshot of the access policy"

The agent opens a real Chrome browser, logs in, navigates, captures the screenshot, and saves it
directly to the evidence store — no human in the loop.

---

## 2. Compliance Frameworks — What They Actually Are

### SOC2 (Service Organization Control 2)
- Defined by AICPA (American Institute of CPAs)
- Proves security, availability, confidentiality, and privacy
- Organized into **Trust Services Criteria**: CC1, CC2, ... CC9 (CC = Common Criteria)
- Example: CC6.1 = "Logical and physical access controls"

### PCI-DSS (Payment Card Industry Data Security Standard)
- Required for organizations that handle cardholder (credit/debit) data
- Organized into **Requirements**: Req 1, Req 2, ... Req 12
- Each requirement has sub-requirements: Req 8.2 = "User credentials are managed"

### HIPAA
- US federal law for healthcare data
- **Security Rule** defines technical safeguards using section codes: §164.312
- Evidence proves that ePHI (electronic Protected Health Information) is secured

### How a Control Works

Think of it as a hierarchy:

```
Framework  →  Control  →  Evidence  →  Submission
   SOC2         CC6.1     screenshot    submitted by
                          of access     dinesh@wso2.com
                          policy        on 2026-05-12
```

A **framework** contains many **controls**.
A **control** has many pieces of **evidence** uploaded against it.
An **evidence** item has many **submissions** (one per audit cycle or reviewer).

This hierarchy is exactly reflected in the database tables.

---

## 3. Full Architecture

```
┌─────────────────────────────────────────────────┐
│            React Frontend (Vite + TypeScript)    │
│                                                  │
│  Dashboard | Evidence | Submit | History | Agent │
└──────────────────────┬──────────────────────────┘
                       │ HTTP REST over JSON / multipart-form
                       │ via Axios + TanStack React Query
┌──────────────────────▼──────────────────────────┐
│              FastAPI Backend (Python 3.11)        │
│                                                  │
│  /api/frameworks  /api/controls  /api/evidence   │
│  /api/submissions  /api/agent/run                │
│                                                  │
│  ┌───────────────────────────────────────────┐   │
│  │           AI Agent Layer                  │   │
│  │  browser-use  +  Playwright  +  LLM       │   │
│  └───────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │
         ┌─────────────┴───────────────┐
         │                             │
┌────────▼──────────┐    ┌─────────────▼──────────┐
│  SQLite (dev)     │    │  Local filesystem       │
│  PostgreSQL (prod)│    │  backend/uploads/       │
│                   │    │  (Azure Blob ready)     │
│  4 tables:        │    │                         │
│  frameworks       │    │  Stores:                │
│  controls         │    │  .png screenshots       │
│  evidence         │    │  .pdf exports           │
│  submissions      │    │  config files           │
└───────────────────┘    └─────────────────────────┘
```

### Request Flow — Submitting Evidence

1. User fills form at `http://localhost:5173/submit`
2. Browser sends `POST http://localhost:8000/api/evidence/` with `multipart/form-data`
3. FastAPI receives the request, parses form fields and file
4. `save_file()` writes the file to `backend/uploads/` with a UUID filename
5. SQLAlchemy writes a row to the `evidence` table
6. FastAPI returns the new evidence object as JSON
7. React Query marks `["evidence"]` stale — any component showing evidence refetches automatically

### Request Flow — AI Agent

1. User types a prompt at `http://localhost:5173/agent`
2. Browser sends `POST http://localhost:8000/api/agent/run` with `{"prompt": "..."}`
3. FastAPI calls `run_agent(prompt)`
4. `run_agent` starts `browser-use` Agent with the configured LLM
5. The agent opens Chrome, navigates, takes screenshots
6. The final screenshot is saved to `backend/uploads/`
7. FastAPI returns `{"status": "completed", "screenshot_url": "/uploads/xxx.png"}`
8. React displays the screenshot image

---

## 4. Technology Stack — Why Each Was Chosen

### Python 3.11 + FastAPI (Backend)
`browser-use` (the AI agent library) is Python-only. Keeping the entire backend in Python avoids
building a language bridge.

FastAPI was chosen over Flask or Django because:
- It is **async-native** — can handle many concurrent requests
- It auto-generates **Swagger UI** (`/docs`) from your code — no manual API docs
- **Pydantic** (built-in) validates every request and response with Python type hints

### SQLAlchemy ORM + Alembic
SQLAlchemy lets you write Python classes that map to database tables.
You write `framework.name` instead of `SELECT name FROM frameworks WHERE id = ?`.

Alembic manages **schema migrations** — controlled, versioned changes to the database structure
that can be rolled forward or back without losing data.

### React 19 + TypeScript + Vite (Frontend)
React renders UI as components. TypeScript catches bugs at compile time (before the browser runs code).
Vite is the build tool — it starts a dev server in milliseconds and does fast hot-reload.

### TanStack React Query (v5)
Manages all server state in the frontend:
- `useQuery` fetches data and caches it
- `useMutation` sends changes (POST/DELETE) and automatically invalidates stale caches
- No manual `useState` + `useEffect` + `fetch` boilerplate needed

### Axios
HTTP client. Used instead of the browser's built-in `fetch` because:
- Cleaner API for setting baseURL once and using it everywhere
- Automatic JSON serialization/deserialization

### browser-use + Playwright
`browser-use` is a Python library that connects an LLM to a real browser.
Playwright is the underlying browser automation framework.
The LLM "sees" the page (screenshot + DOM) and decides what to click or type.

---

## 5. Database Schema — Entity Relationships

```
frameworks (1) ──< controls (1) ──< evidence (1) ──< submissions
```

Each framework has many controls.
Each control has many evidence items.
Each evidence item has many submissions.

### frameworks table
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | auto-increment |
| name | VARCHAR(50) | e.g. "SOC2", "PCI-DSS" — unique |
| description | VARCHAR(500) | optional |

### controls table
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| framework_id | INTEGER FK | → frameworks.id |
| control_ref | VARCHAR(50) | e.g. "CC6.1", "Req 8.2" |
| title | VARCHAR(255) | short title |
| description | VARCHAR(1000) | full description |

### evidence table
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| title | VARCHAR(255) | human-readable name |
| description | VARCHAR(1000) | optional |
| file_name | VARCHAR(255) | UUID-based filename on disk |
| file_url | VARCHAR(1000) | served at /uploads/<file_name> |
| control_id | INTEGER FK | → controls.id |
| created_at | DATETIME | auto-set on insert |
| updated_at | DATETIME | auto-set on update |

### submissions table
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| evidence_id | INTEGER FK | → evidence.id |
| submitted_by | VARCHAR(255) | email/name of submitter |
| submitted_at | DATETIME | auto-set on insert |
| status | VARCHAR(50) | "pending", "approved", "rejected" |
| notes | VARCHAR(1000) | optional reviewer notes |

---

## 6. Project Folder Map

```
Compliance-Evidence-Submission-Portal/
│
├── backend/                   ← Python FastAPI server
│   ├── .env                   ← DATABASE_URL and secrets (NOT in git)
│   ├── alembic.ini            ← Alembic tool configuration
│   ├── requirements.txt       ← Python package list
│   ├── compliance.db          ← SQLite database file (created on first run)
│   ├── uploads/               ← Evidence files saved here
│   │
│   ├── alembic/               ← Database migration system
│   │   ├── env.py             ← Migration runner (connects Alembic to SQLAlchemy)
│   │   └── versions/          ← One file per migration
│   │       └── 57b39d9adcfc_initial_tables.py
│   │
│   └── app/                   ← Application code
│       ├── main.py            ← FastAPI app instance, middleware, routers
│       ├── config.py          ← Reads .env via pydantic-settings
│       ├── database.py        ← SQLAlchemy engine and session factory
│       ├── models/            ← Database table definitions (SQLAlchemy)
│       ├── schemas/           ← API request/response shapes (Pydantic)
│       ├── api/routes/        ← HTTP endpoint handlers
│       ├── agent/             ← AI browser agent (Phase 6)
│       └── storage/           ← File save/delete utilities
│
└── frontend/                  ← React TypeScript app
    ├── package.json           ← Node dependencies
    ├── vite.config.ts         ← Vite build configuration
    ├── tsconfig.json          ← TypeScript configuration
    └── src/
        ├── main.tsx           ← App bootstrap (QueryClient, React root)
        ├── App.tsx            ← Route definitions
        ├── index.css          ← Global styles
        ├── api/client.ts      ← All HTTP calls (centralized)
        ├── components/        ← Shared components (Navbar)
        └── pages/             ← One file per page
```

---

## 7. Read This Before Moving On

- **Each stage guide is self-contained.** You can follow them in order or jump to a specific stage.
- **Every command is shown exactly.** Copy-paste as-is.
- **Every file is shown completely.** After explaining lines, you create the file.
- **You are on Linux.** Commands use `python3.11`, `source venv/bin/activate`, etc.

**Stage order:**

| File | What It Covers |
|---|---|
| `stage-01-project-overview.md` | This file — understand the project |
| `stage-02-backend-foundation.md` | FastAPI app, config, database, health |
| `stage-03-database-models.md` | SQLAlchemy models (4 tables) |
| `stage-04-alembic-migrations.md` | Alembic setup and running migrations |
| `stage-05-api-routes.md` | Pydantic schemas + FastAPI routes |
| `stage-06-file-storage.md` | Multipart upload, file save/serve |
| `stage-07-react-frontend.md` | Full React frontend |
| `stage-08-ai-agent.md` | AI agent layer (Phase 6 — to be built) |
