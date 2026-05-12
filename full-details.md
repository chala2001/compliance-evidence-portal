# Compliance Evidence Submission Portal — Full Technical Details

---

## Table of Contents

1. [Project Background](#1-project-background)
2. [Problem Being Solved](#2-problem-being-solved)
3. [Solution Overview](#3-solution-overview)
4. [Compliance Frameworks Explained](#4-compliance-frameworks-explained)
5. [Full Architecture](#5-full-architecture)
6. [Technology Choices & Why](#6-technology-choices--why)
7. [Complete Project Structure](#7-complete-project-structure)
8. [Database Design](#8-database-design)
9. [Backend — Every File Explained](#9-backend--every-file-explained)
10. [Frontend — Every File Explained](#10-frontend--every-file-explained)
11. [AI Agent Layer — Deep Dive](#11-ai-agent-layer--deep-dive)
12. [Storage Layer](#12-storage-layer)
13. [API Reference](#13-api-reference)
14. [Setup & Installation](#14-setup--installation)
15. [Running the Application](#15-running-the-application)
16. [Build Phases — Full History](#16-build-phases--full-history)
17. [LLM Provider Options](#17-llm-provider-options)
18. [Known Issues & Limitations](#18-known-issues--limitations)
19. [Future Roadmap](#19-future-roadmap)

---

## 1. Project Background

WSO2 is subject to multiple compliance frameworks including **SOC2**, **PCI-DSS**, and **HIPAA**. Each framework requires periodic submission of evidence to demonstrate that internal controls are being followed.

Evidence includes:
- Screenshots of cloud portal configurations
- Exported audit logs
- Configuration files
- Access policy documents

Currently this process is entirely manual — engineers navigate to Azure Portal, AWS Console, or other tools, capture screenshots, and upload them to the relevant control references by hand. This is slow, error-prone, and doesn't scale across multiple frameworks.

---

## 2. Problem Being Solved

| Problem | Impact |
|---|---|
| Manual screenshot collection | Hours of engineer time per audit cycle |
| No central evidence store | Evidence scattered across emails, Confluence, shared drives |
| No audit trail | No record of who submitted what, when |
| No control mapping | Hard to know which evidence covers which control |
| No version history | Can't compare old vs new evidence |

---

## 3. Solution Overview

A standalone web application with two core layers:

### Layer 1 — Evidence Management Portal
A web UI where engineers can:
- Upload evidence files manually
- Map evidence to specific compliance controls
- View full submission history with metadata
- Browse all evidence by framework or control

### Layer 2 — AI Agent
An LLM-powered browser agent that:
- Accepts natural language prompts
- Autonomously navigates cloud portals (Azure, AWS, ServiceNow, etc.)
- Takes screenshots of the relevant pages
- Saves them directly to the evidence store

**Example:**
> "Go to Azure Portal, navigate to Key Vault X, take a screenshot of the access policy"

The agent opens a real Chrome browser, logs in, navigates, and captures the screenshot — entirely automated.

---

## 4. Compliance Frameworks Explained

### SOC2 (Service Organization Control 2)
- Defined by **AICPA** (American Institute of CPAs)
- Covers security, availability, processing integrity, confidentiality, and privacy
- Uses **Trust Services Criteria (TSC)** — controls like CC6.1, CC7.2, CC8.1
- WSO2 must prove controls are in place for customer-facing services

### PCI-DSS (Payment Card Industry Data Security Standard)
- Defined by the **PCI Security Standards Council**
- Required for any organization that handles cardholder data
- Organized into **Requirements** — Req 1.1, Req 8.2, Req 10.1, etc.
- Evidence proves systems meet data security requirements

### HIPAA (Health Insurance Portability and Accountability Act)
- US federal law for healthcare data privacy and security
- **Security Rule** defines technical safeguards (§164.312)
- Evidence proves ePHI (electronic Protected Health Information) is secured

### How Controls Work
Each framework has numbered controls. Evidence is submitted *against* a control to prove it is being met:

```
Framework: SOC2
  └── Control: CC6.1 — Logical & Physical Access Controls
        └── Evidence: screenshot of Azure Key Vault access policy
              └── Submission: submitted by dinethsi@wso2.com on 2026-05-12
```

---

## 5. Full Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite + TS)                │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌─────────┐ ┌──────┐ │
│  │Dashboard │ │Evidence  │ │Submit  │ │History  │ │Agent │ │
│  │          │ │List      │ │Evidence│ │         │ │Runner│ │
│  └──────────┘ └──────────┘ └────────┘ └─────────┘ └──────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP REST (JSON / multipart)
                           │ Axios + TanStack React Query
┌──────────────────────────▼──────────────────────────────────┐
│                    FastAPI Backend (Python 3.11)              │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ /api/        │  │ /api/        │  │ /api/              │  │
│  │ frameworks   │  │ controls     │  │ evidence           │  │
│  │ GET, POST    │  │ GET, POST    │  │ GET, POST, DELETE  │  │
│  └──────────────┘  └──────────────┘  └────────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────────────────────────────┐  │
│  │ /api/        │  │ /api/agent/run                       │  │
│  │ submissions  │  │ POST — triggers AI agent             │  │
│  │ GET, POST    │  └──────────────────┬───────────────────┘  │
│  └──────────────┘                     │                      │
│                                       ▼                      │
│              ┌────────────────────────────────────────────┐  │
│              │           AI Agent Layer                    │  │
│              │                                            │  │
│              │  ChatOllama / ChatGoogle / ChatAnthropic   │  │
│              │  (LLM decides what actions to take)        │  │
│              │                   +                        │  │
│              │  browser-use (agentic loop)                │  │
│              │                   +                        │  │
│              │  Playwright → System Chrome                │  │
│              └────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────────┘
                       │
         ┌─────────────┴──────────────────┐
         │                                │
┌────────▼─────────────┐    ┌─────────────▼──────────────────┐
│  SQLite (dev)        │    │  Local Filesystem               │
│  PostgreSQL (prod)   │    │  backend/uploads/               │
│                      │    │  (Azure Blob Storage ready)     │
│  Tables:             │    │                                 │
│  - frameworks        │    │  Stores:                        │
│  - controls          │    │  - Screenshots (.png)           │
│  - evidence          │    │  - PDFs                         │
│  - submissions       │    │  - Config exports               │
└──────────────────────┘    └─────────────────────────────────┘
```

---

## 6. Technology Choices & Why

### Python + FastAPI (Backend)
- `browser-use` is a Python-native library — keeping backend in Python avoids a language bridge
- FastAPI is async, modern, and auto-generates Swagger UI (`/docs`)
- Pydantic provides strong type validation at the API boundary
- SQLAlchemy ORM means no raw SQL for standard operations

### React + TypeScript + Vite (Frontend)
- React is the industry standard for dashboards
- TypeScript catches bugs at compile time rather than runtime
- Vite is significantly faster than Create React App for development

### SQLAlchemy + Alembic
- SQLAlchemy ORM: write Python classes, not SQL — easier to maintain
- Alembic migrations: safely evolve the database schema without losing data
- Supports both SQLite (dev, no setup) and PostgreSQL (prod, via Docker)

### browser-use
- Connects an LLM to a real browser via Playwright
- The LLM "sees" the page (screenshot + DOM) and decides what to click
- Supports Ollama, Gemini, Claude, OpenAI, Groq, and more
- No need to write hard-coded Playwright scripts for each portal

### Playwright + System Chrome
- System Chrome used instead of Playwright's bundled Chromium to avoid macOS Gatekeeper security blocks
- `BrowserProfile(channel="chrome")` tells Playwright to use the installed Chrome

### SQLite vs PostgreSQL
- SQLite used in development — no Docker required, zero config
- PostgreSQL available via `docker-compose.yml` for production
- Switch by changing `DATABASE_URL` in `.env`

### Local Storage vs Azure Blob
- Local filesystem used now — files saved to `backend/uploads/`
- Azure Blob Storage integration is designed and ready — swap in `azure_storage.py` and update `evidence.py` route
- Storage layer is intentionally isolated in `app/storage/` so the switch requires minimal changes

---

## 7. Complete Project Structure

```
compliance-evidence-portal/
│
├── Compliance-Evidence-Submission-Portal.md   # Original project spec
├── README.md                                  # Project overview
├── full-details.md                            # This file
├── docker-compose.yml                         # PostgreSQL for production
│
├── backend/
│   ├── .env                                   # Secrets (never committed)
│   ├── alembic.ini                            # Alembic config
│   ├── requirements.txt
│   ├── uploads/                               # Stored evidence files
│   │
│   ├── alembic/
│   │   ├── env.py                             # Migration environment (reads .env)
│   │   └── versions/                          # Auto-generated migration files
│   │
│   └── app/
│       ├── __init__.py
│       ├── main.py                            # FastAPI app, CORS, static mount
│       ├── config.py                          # Pydantic settings from .env
│       ├── database.py                        # Engine, SessionLocal, Base, get_db
│       │
│       ├── models/                            # SQLAlchemy table definitions
│       │   ├── __init__.py
│       │   ├── framework.py                   # frameworks table
│       │   ├── control.py                     # controls table
│       │   ├── evidence.py                    # evidence table
│       │   └── submission.py                  # submissions table
│       │
│       ├── schemas/                           # Pydantic API shapes
│       │   ├── __init__.py
│       │   ├── framework.py                   # FrameworkCreate, FrameworkResponse
│       │   ├── control.py                     # ControlCreate, ControlResponse
│       │   ├── evidence.py                    # EvidenceCreate, EvidenceResponse
│       │   └── submission.py                  # SubmissionCreate, SubmissionResponse
│       │
│       ├── api/
│       │   ├── __init__.py
│       │   └── routes/
│       │       ├── __init__.py
│       │       ├── frameworks.py              # GET/POST /api/frameworks/
│       │       ├── controls.py                # GET/POST /api/controls/
│       │       ├── evidence.py                # GET/POST/DELETE /api/evidence/
│       │       ├── submissions.py             # GET/POST /api/submissions/
│       │       └── agent.py                   # POST /api/agent/run
│       │
│       ├── agent/
│       │   ├── __init__.py
│       │   └── runner.py                      # browser-use agent execution
│       │
│       └── storage/
│           ├── __init__.py
│           └── local_storage.py               # save_file(), delete_file()
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.tsx                           # QueryClient, app bootstrap
        ├── App.tsx                            # React Router routes
        ├── index.css                          # Global styles
        │
        ├── api/
        │   └── client.ts                      # Axios instance + all API calls
        │
        ├── components/
        │   └── Navbar.tsx                     # Top navigation bar
        │
        └── pages/
            ├── Dashboard.tsx                  # Stats cards + recent submissions
            ├── EvidenceList.tsx               # Evidence table with delete
            ├── SubmitEvidence.tsx             # File upload form
            ├── SubmissionHistory.tsx          # Full audit trail
            └── AgentRunner.tsx                # AI agent prompt + results
```

---

## 8. Database Design

### Entity Relationship

```
frameworks (1) ──── (many) controls (1) ──── (many) evidence (1) ──── (many) submissions
```

### Table: frameworks

| Column | Type | Description |
|---|---|---|
| id | Integer PK | Auto-increment |
| name | String(50) | e.g. SOC2, PCI-DSS, HIPAA |
| description | String(500) | Framework description |

### Table: controls

| Column | Type | Description |
|---|---|---|
| id | Integer PK | Auto-increment |
| framework_id | FK → frameworks.id | Parent framework |
| control_ref | String(50) | e.g. CC6.1, Req 8.2 |
| title | String(255) | Short title |
| description | String(1000) | Full description |

### Table: evidence

| Column | Type | Description |
|---|---|---|
| id | Integer PK | Auto-increment |
| title | String(255) | Evidence title |
| description | String(1000) | Optional description |
| file_name | String(255) | UUID filename on disk |
| file_url | String(1000) | Accessible URL path |
| control_id | FK → controls.id | Linked control |
| created_at | DateTime | Auto-set on create |
| updated_at | DateTime | Auto-set on update |

### Table: submissions

| Column | Type | Description |
|---|---|---|
| id | Integer PK | Auto-increment |
| evidence_id | FK → evidence.id | Linked evidence |
| submitted_by | String(255) | Submitter email/name |
| submitted_at | DateTime | Auto-set on create |
| status | String(50) | pending / approved / rejected |
| notes | String(1000) | Optional reviewer notes |

---

## 9. Backend — Every File Explained

### `app/main.py`
FastAPI application entry point. Registers:
- CORS middleware — allows the React frontend (port 5173) to call the API
- Static files mount — serves `uploads/` folder at `/uploads` URL so evidence files are accessible
- All 5 API routers with `/api` prefix

### `app/config.py`
Uses `pydantic-settings` to read environment variables from `.env`. Any file that needs config imports `settings` from here:
```python
from app.config import settings
print(settings.DATABASE_URL)
```

### `app/database.py`
Sets up three things:
- `engine` — the SQLAlchemy connection to the database
- `SessionLocal` — a factory that creates new DB sessions
- `get_db()` — a FastAPI dependency that opens a session per request and closes it after

### `app/models/`
SQLAlchemy models using the modern `Mapped[]` typed syntax. Each class maps to a database table. Relationships are declared with `relationship()` for ORM joins.

### `app/schemas/`
Pydantic models split into `Create` (input) and `Response` (output) shapes. `model_config = {"from_attributes": True}` enables converting SQLAlchemy objects directly to Pydantic responses.

### `app/api/routes/evidence.py`
The most complex route — uses `Form()` and `File()` for multipart uploads instead of JSON body. File is saved to disk first, then the DB record is created with the generated URL.

### `app/agent/runner.py`
Core agent execution:
1. Creates the LLM instance (Ollama/Gemini/Claude)
2. Configures Chrome via `BrowserProfile`
3. Creates `BrowserSession` with that profile
4. Creates `Agent` with the prompt, LLM, and browser
5. Runs the agent — it loops until the task is done or fails
6. Extracts the last screenshot from history (base64)
7. Saves the screenshot to `uploads/`
8. Returns result text + screenshot URL

### `app/storage/local_storage.py`
Two functions:
- `save_file(file)` — generates a UUID filename, saves to `uploads/`, returns `(filename, url)`
- `delete_file(filename)` — removes file from disk if it exists

---

## 10. Frontend — Every File Explained

### `src/main.tsx`
Wraps the app in `QueryClientProvider` from TanStack React Query — this enables data fetching, caching, and automatic refetching across all components.

### `src/App.tsx`
Sets up React Router with 5 routes mapping paths to page components.

### `src/api/client.ts`
Single Axios instance pointing to `http://localhost:8000/api`. Exports named API objects (`evidenceApi`, `agentApi`, etc.) — all HTTP calls are centralised here, not scattered across components.

### `src/pages/Dashboard.tsx`
Shows 4 stat cards (total evidence, submissions, frameworks, pending reviews) and a table of the 5 most recent submissions. Uses `useQuery` from React Query for automatic data fetching.

### `src/pages/EvidenceList.tsx`
Lists all evidence in a table with a framework filter dropdown. Clicking Delete calls `evidenceApi.delete()` and React Query automatically refreshes the table via `invalidateQueries`.

### `src/pages/SubmitEvidence.tsx`
Two-step form — first pick a framework (loads controls for that framework), then fill title/description and attach a file. Builds a `FormData` object and POSTs as `multipart/form-data`.

### `src/pages/SubmissionHistory.tsx`
Simple table showing all submissions with status badges (pending/approved/rejected) colour-coded via CSS classes.

### `src/pages/AgentRunner.tsx`
Text area for the prompt, "Run Agent" button, loading state indicator, and result display. On success shows the agent's result text and the captured screenshot as an `<img>` tag.

---

## 11. AI Agent Layer — Deep Dive

### What browser-use Does

browser-use creates an **agentic loop** between an LLM and a real browser:

```
┌─────────────────────────────────────┐
│           Agentic Loop               │
│                                     │
│  1. Take screenshot of current page │
│  2. Extract DOM structure           │
│  3. Send to LLM: "what to do next?" │
│  4. LLM returns action:             │
│     - navigate(url)                 │
│     - click(element_index)          │
│     - input(index, text)            │
│     - scroll(direction)             │
│     - screenshot()                  │
│     - done(result)                  │
│  5. Execute action via Playwright   │
│  6. Repeat until done or max steps  │
└─────────────────────────────────────┘
```

### Why the LLM Needs to Be Good

The LLM must:
- Understand what it sees on the page
- Reason about what action achieves the goal
- Handle unexpected states (login pages, popups, errors)
- Know when the task is complete

Small models (llama3.2 3B) hallucinate and loop. Larger models (qwen2.5:7b, Gemini, Claude) are significantly more reliable.

### Agent History

`agent.run()` returns `AgentHistoryList` which contains every step taken:
- `history.final_result()` — the agent's conclusion
- `history.screenshots(n_last=1)` — base64 PNG of the last page viewed

### Browser Configuration

```python
profile = BrowserProfile(
    channel="chrome",   # use system Chrome, not Playwright's Chromium
    headless=False      # False = visible window (good for debugging)
                        # True = invisible (good for production)
)
browser = BrowserSession(browser_profile=profile)
agent = Agent(task=prompt, llm=llm, browser=browser)
```

---

## 12. Storage Layer

### Current: Local Filesystem

Files are saved to `backend/uploads/` with UUID filenames to avoid collisions:

```
uploads/
  3f4a1b2c-8d9e-4f5a-b6c7-d8e9f0a1b2c3.png
  7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d.pdf
```

Files are served at `http://localhost:8000/uploads/<filename>` via FastAPI's `StaticFiles` mount.

### Future: Azure Blob Storage

The storage layer is isolated in `app/storage/`. To switch to Azure:
1. Create `app/storage/azure_storage.py` with the same `save_file()` / `delete_file()` interface
2. Update the import in `app/api/routes/evidence.py`
3. Add `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_CONTAINER_NAME` to `.env`

No other files change.

---

## 13. API Reference

### POST `/api/evidence/`

**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|---|---|---|
| title | string | Yes |
| control_id | integer | Yes |
| description | string | No |
| file | file | Yes |

**Response:**
```json
{
  "id": 1,
  "title": "Key Vault Access Policy",
  "description": "Screenshot of access policy",
  "file_name": "3f4a1b2c.png",
  "file_url": "/uploads/3f4a1b2c.png",
  "control_id": 1,
  "created_at": "2026-05-12T10:00:00",
  "updated_at": "2026-05-12T10:00:00"
}
```

### POST `/api/agent/run`

**Content-Type:** `application/json`

```json
{
  "prompt": "Go to google.com and take a screenshot"
}
```

**Response:**
```json
{
  "status": "completed",
  "result": "Successfully navigated to google.com and captured screenshot",
  "screenshot_url": "/uploads/7a8b9c0d.png"
}
```

---

## 14. Setup & Installation

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Python | 3.11+ | Backend runtime |
| Node.js | 20+ | Frontend runtime |
| Ollama | Latest | Local LLM server |
| Google Chrome | Any | Browser automation |
| Docker Desktop | Any | Optional — PostgreSQL |

### Step 1 — Clone and create virtual environment

```bash
cd backend
/opt/homebrew/bin/python3.11 -m venv venv
source venv/bin/activate
python --version  # should show 3.11.x
```

### Step 2 — Install Python dependencies

```bash
# Phase 1-4 (core backend)
pip install fastapi uvicorn sqlalchemy alembic psycopg2-binary \
  python-dotenv pydantic-settings python-multipart

# Phase 6 (agent layer)
pip install browser-use playwright
python -m playwright install chromium
```

### Step 3 — Configure environment

Create `backend/.env`:
```
DATABASE_URL=sqlite:///./compliance.db
GEMINI_API_KEY=your_gemini_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### Step 4 — Run database migrations

```bash
cd backend
source venv/bin/activate
python -m alembic upgrade head
```

### Step 5 — Install frontend dependencies

```bash
cd frontend
npm install
```

### Step 6 — Set up Ollama (local LLM)

```bash
# Install from ollama.com, then:
ollama pull qwen2.5:7b
```

---

## 15. Running the Application

### Backend
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm run dev
```

### Access Points

| URL | Description |
|---|---|
| `http://localhost:5173` | React frontend app |
| `http://localhost:8000/docs` | Swagger API documentation |
| `http://localhost:8000/health` | Backend health check |
| `http://localhost:8000/uploads/<file>` | Stored evidence files |

---

## 16. Build Phases — Full History

### Phase 1 — Backend Foundation
- Created `backend/app/` folder structure
- Set up Python 3.11 virtual environment
- Installed: `fastapi uvicorn sqlalchemy psycopg2-binary python-dotenv pydantic-settings`
- Created `config.py`, `database.py`, `main.py`
- Created `docker-compose.yml` for PostgreSQL
- Verified `/health` endpoint works

### Phase 2 — Database Models + Migrations
- Installed: `alembic`
- Created 4 SQLAlchemy models: `Framework`, `Control`, `Evidence`, `Submission`
- Ran `alembic init alembic`
- Configured `alembic/env.py` to read `DATABASE_URL` from `.env` dynamically
- Ran `alembic revision --autogenerate -m "initial tables"`
- Ran `alembic upgrade head` to create tables

### Phase 3 — API Routes
- Created Pydantic schemas (`Create` + `Response`) for all 4 models
- Created FastAPI route files for frameworks, controls, evidence, submissions
- Registered all routers in `main.py`
- Verified all 10 schemas and 4 route groups appear in Swagger UI

### Phase 4 — Local File Storage
- Installed: `python-multipart`
- Created `app/storage/local_storage.py` with `save_file()` and `delete_file()`
- Updated evidence route to accept `multipart/form-data` with `UploadFile`
- Mounted `uploads/` as static files in `main.py`

### Phase 5 — React Frontend
- Created Vite + React + TypeScript project
- Installed: `react-router-dom axios @tanstack/react-query`
- Created 5 pages: Dashboard, EvidenceList, SubmitEvidence, SubmissionHistory, AgentRunner
- Created Navbar component and global CSS styles
- Wired all pages to backend API via `src/api/client.ts`

### Phase 6 — AI Agent Layer
- Installed: `browser-use playwright`
- Created `app/agent/runner.py` using `browser-use` with `ChatOllama`
- Configured `BrowserProfile(channel="chrome")` to use system Chrome (avoids macOS Gatekeeper)
- Created `app/api/routes/agent.py` with `POST /api/agent/run`
- Updated `AgentRunner.tsx` to call real API and display screenshot
- Tested with Ollama `llama3.2` — agent navigates but hallucinates with small models
- Switched database from PostgreSQL to SQLite for simplicity

---

## 17. LLM Provider Options

browser-use supports multiple LLM providers. Switch by editing `backend/app/agent/runner.py`.

### Ollama (Local — No API Key)
```python
from browser_use import Agent, ChatOllama
llm = ChatOllama(model="qwen2.5:7b")  # or llama3.1:8b
```
- Free, runs on your Mac
- `qwen2.5:7b` recommended over `llama3.2` for browser tasks
- Slower, less accurate than cloud models

### Google Gemini
```python
from browser_use import Agent, ChatGoogle
llm = ChatGoogle(model="gemini-2.0-flash", api_key=settings.GEMINI_API_KEY)
```
- Free tier available (rate limited)
- Fast and capable

### Anthropic Claude
```python
from browser_use import Agent, ChatAnthropic
llm = ChatAnthropic(model="claude-sonnet-4-6", api_key=settings.ANTHROPIC_API_KEY)
```
- Most capable for complex navigation tasks
- Paid API

### Model Capability for Browser Tasks

| Model | Browser Navigation | Reliability | Cost |
|---|---|---|---|
| llama3.2 (3B) | Poor — hallucinates | Low | Free |
| llama3.1:8b | Moderate | Medium | Free |
| qwen2.5:7b | Good | Medium-High | Free |
| gemini-2.0-flash | Very Good | High | Free tier |
| claude-sonnet-4-6 | Excellent | Very High | Paid |

---

## 18. Known Issues & Limitations

### Agent Issues
- **Small LLMs hallucinate** — `llama3.2` invents data that doesn't exist on the page and gets stuck in loops. Use `qwen2.5:7b` or larger.
- **Page load timeouts** — `Page readiness timeout` warnings are normal for slow-loading portals like Azure. The agent retries automatically.
- **Loop detection** — The agent detects when it's stuck and injects a nudge. This is browser-use's built-in protection.
- **MFA/SSO login** — Cloud portals with multi-factor authentication will block the agent. Credential injection and MFA bypass require additional configuration.

### Infrastructure Issues
- **No authentication** — Anyone with the URL can use the portal. User authentication needs to be added before production deployment.
- **SQLite not suitable for production** — Switch `DATABASE_URL` to PostgreSQL for multi-user, concurrent access.
- **Local storage not persistent** — Files in `backend/uploads/` are lost if the server is moved. Swap to Azure Blob Storage for production.

### macOS Specific
- **Playwright Chromium blocked by Gatekeeper** — Fixed by using `channel="chrome"` (system Chrome) in `BrowserProfile`.
- **Ollama not in PATH** — If `ollama` command not found after install, open the Ollama app from Applications first.

---

## 19. Future Roadmap

| Feature | Priority | Description |
|---|---|---|
| Azure Blob Storage | High | Replace local filesystem with Azure Blob for production |
| User Authentication | High | JWT-based login so submissions are tied to users |
| Evidence Versioning | Medium | Track multiple versions of evidence for the same control |
| Agent Task Queue | Medium | Background job queue so agent tasks don't block the API |
| Agent Streaming Logs | Medium | Real-time log streaming to the UI via WebSocket |
| Portal Credentials Manager | Medium | Securely store and inject portal credentials for the agent |
| Control Seeding | Low | Pre-populate SOC2, PCI-DSS, HIPAA controls from official sources |
| Evidence Expiry Alerts | Low | Notify when evidence is older than a threshold |
| Export Reports | Low | Generate PDF compliance reports per framework |
| Multi-user Workspaces | Low | Separate evidence stores per team or project |