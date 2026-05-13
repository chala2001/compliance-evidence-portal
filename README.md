# Compliance Evidence Submission Portal

An AI-powered compliance evidence management platform that automates evidence collection from cloud portals (Azure, AWS, ServiceNow, etc.) via browser agents, maps artifacts to compliance controls, and maintains a full submission history with audit trail.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [AI Agent Layer](#ai-agent-layer)
- [Database Schema](#database-schema)
- [Build Phases](#build-phases)
- [Current Status](#current-status)

---

## Overview

WSO2 is subject to multiple compliance frameworks including SOC2, PCI-DSS, and HIPAA. Each requires periodic submission of evidence (screenshots, configuration exports, audit logs) to demonstrate control adherence.

This portal solves the manual evidence collection problem by providing:

- A centralised evidence store with full submission history and audit trail
- An AI agent that autonomously navigates cloud portals and captures evidence based on natural language prompts
- Evidence-to-control mapping across SOC2, PCI-DSS, and HIPAA frameworks
- Secure artifact storage (local filesystem, with Azure Blob Storage swap-in ready)

**Example agent prompt:**
> "Go to Azure Portal, navigate to Key Vault X, take a screenshot of the access policy, and upload it to control CC6.1"

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 React Frontend (Vite + TS)               │
│   Dashboard | Evidence | Submit | History | Agent UI     │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API (HTTP/JSON)
┌──────────────────────▼──────────────────────────────────┐
│                  FastAPI Backend (Python)                 │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────────┐│
│  │ Evidence API│ │ Controls API │ │    Agent API       ││
│  └─────────────┘ └──────────────┘ └────────┬───────────┘│
│                                            │             │
│  ┌─────────────────────────────────────────▼───────────┐ │
│  │               AI Agent Layer                         │ │
│  │    LLM (Claude / Gemini / Ollama) + browser-use      │ │
│  │    + Playwright (system Chrome)                      │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │
         ┌─────────────┴──────────────┐
         │                            │
┌────────▼─────────┐      ┌──────────▼──────────────┐
│   PostgreSQL DB  │      │   Local Storage / Azure  │
│  (metadata,      │      │   Blob (screenshots,     │
│   history,       │      │   PDFs, config exports)  │
│   control maps)  │      └───────────────────────────┘
└──────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 + FastAPI |
| Frontend | React + TypeScript + Vite |
| Database | PostgreSQL (Docker) |
| ORM | SQLAlchemy + Alembic (migrations) |
| AI Agent | browser-use 0.12.6 |
| LLM | Ollama (local) / Gemini / Claude (configurable) |
| Browser Automation | Playwright (system Chrome) |
| Artifact Storage | Local filesystem (Azure Blob Storage ready) |
| HTTP Client | Axios + TanStack React Query |

---

## Project Structure

```
compliance-evidence-portal/
│
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI entry point, CORS, static files
│   │   ├── config.py                # Pydantic settings — reads .env
│   │   ├── database.py              # SQLAlchemy engine, session, Base
│   │   │
│   │   ├── models/                  # SQLAlchemy table definitions
│   │   │   ├── framework.py         # Compliance frameworks (SOC2, PCI-DSS, HIPAA)
│   │   │   ├── control.py           # Controls (CC6.1, Req 8.2, etc.)
│   │   │   ├── evidence.py          # Evidence items with file references
│   │   │   └── submission.py        # Submission history with audit metadata
│   │   │
│   │   ├── schemas/                 # Pydantic request/response shapes
│   │   │   ├── framework.py
│   │   │   ├── control.py
│   │   │   ├── evidence.py
│   │   │   └── submission.py
│   │   │
│   │   ├── api/routes/              # FastAPI route handlers
│   │   │   ├── frameworks.py
│   │   │   ├── controls.py
│   │   │   ├── evidence.py          # Handles multipart file uploads
│   │   │   ├── submissions.py
│   │   │   └── agent.py             # Triggers AI agent tasks
│   │   │
│   │   ├── agent/
│   │   │   └── runner.py            # browser-use agent setup and execution
│   │   │
│   │   └── storage/
│   │       └── local_storage.py     # File save/delete (swap for Azure later)
│   │
│   ├── alembic/                     # Database migration scripts
│   ├── uploads/                     # Stored evidence files
│   ├── .env                         # Environment variables (not committed)
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts            # Axios API calls to backend
│   │   │
│   │   ├── components/
│   │   │   └── Navbar.tsx
│   │   │
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx        # Stats overview + recent submissions
│   │   │   ├── EvidenceList.tsx     # Browse and delete evidence
│   │   │   ├── SubmitEvidence.tsx   # File upload form with control picker
│   │   │   ├── SubmissionHistory.tsx# Full audit trail table
│   │   │   └── AgentRunner.tsx      # Natural language agent prompt UI
│   │   │
│   │   ├── App.tsx                  # React Router setup
│   │   └── main.tsx                 # QueryClient + app bootstrap
│   │
│   └── package.json
│
└── docker-compose.yml               # PostgreSQL for production use
```

---

## Setup & Installation

### Prerequisites

- Python 3.11+
- Node.js 20+
- Ollama (ollama.com) — for local LLM
- Google Chrome — for browser automation
- Docker Desktop — optional, for PostgreSQL

### Backend Setup

```bash
cd backend
/opt/homebrew/bin/python3.11 -m venv venv
source venv/bin/activate

pip install fastapi uvicorn sqlalchemy alembic psycopg2-binary \
  python-dotenv pydantic-settings python-multipart \
  browser-use playwright

python -m playwright install chromium
```

### Environment Variables

Create `backend/.env`:

```
DATABASE_URL=postgresql://complianceuser:compliancepass@localhost:5432/compliance_db
GEMINI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

### Database Migration

```bash
cd backend
source venv/bin/activate
python -m alembic upgrade head
```

### Frontend Setup

```bash
cd frontend
npm install
```

### Ollama (Local LLM)

```bash
ollama pull qwen2.5:7b
```

---

## Running the Application

**Backend** (port 8000):
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Frontend** (port 5173):
```bash
cd frontend
npm run dev
```

**API Docs:** `http://localhost:8000/docs`
**App:** `http://localhost:5173`

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/frameworks/` | List all frameworks |
| POST | `/api/frameworks/` | Create a framework |
| GET | `/api/frameworks/{id}` | Get one framework |
| GET | `/api/controls/` | List controls (filter by `?framework_id=`) |
| POST | `/api/controls/` | Create a control |
| GET | `/api/controls/{id}` | Get one control |
| GET | `/api/evidence/` | List all evidence |
| POST | `/api/evidence/` | Upload evidence (multipart/form-data) |
| GET | `/api/evidence/{id}` | Get one evidence item |
| DELETE | `/api/evidence/{id}` | Delete evidence + file |
| GET | `/api/submissions/` | List all submissions |
| POST | `/api/submissions/` | Create a submission record |
| GET | `/api/submissions/{id}` | Get one submission |
| POST | `/api/agent/run` | Run AI agent with a prompt |

---

## AI Agent Layer

The agent layer uses [browser-use](https://github.com/browser-use/browser-use) to connect an LLM to a real browser session.

### How It Works

```
User types prompt in Agent UI
        │
        ▼
POST /api/agent/run
        │
        ▼
FastAPI → runner.py
        │
        ▼
LLM (Ollama/Gemini/Claude) decides actions
        │
        ▼
browser-use executes: navigate, click, type, screenshot
        │
        ▼
Final screenshot saved to uploads/
        │
        ▼
Result + screenshot URL returned to UI
```

### Supported LLM Providers

| Provider | Config |
|---|---|
| Ollama (local) | `ChatOllama(model="qwen2.5:7b")` — no API key |
| Google Gemini | `ChatGoogle(model="gemini-2.0-flash", api_key=...)` |
| Anthropic Claude | `ChatAnthropic(model="claude-sonnet-4-6", api_key=...)` |

Switch providers by editing `backend/app/agent/runner.py`.

### Browser Configuration

The agent uses the system Chrome browser (avoids macOS Gatekeeper issues with Playwright's Chromium):

```python
profile = BrowserProfile(channel="chrome", headless=False)
```

Set `headless=True` to run invisibly in production.

---

## Database Schema

```
frameworks          controls              evidence              submissions
──────────          ────────              ────────              ───────────
id (PK)             id (PK)               id (PK)               id (PK)
name                framework_id (FK) ─►  title                 evidence_id (FK) ─►
description         control_ref           description            submitted_by
                    title                 file_name              submitted_at
                    description           file_url               status
                                          control_id (FK) ─►     notes
                                          created_at
                                          updated_at
```

---

## Build Phases

| Phase | Status | Description |
|---|---|---|
| Phase 1 | ✅ Done | FastAPI skeleton, DB connection, Docker Compose |
| Phase 2 | ✅ Done | SQLAlchemy models + Alembic migrations |
| Phase 3 | ✅ Done | REST API routes for all resources |
| Phase 4 | ✅ Done | Local file storage with upload/delete |
| Phase 5 | ✅ Done | React frontend — all 5 pages |
| Phase 6 | ✅ Done | AI agent layer with browser-use |
| Phase 7 | 🔲 Pending | Azure Blob Storage swap-in |
| Phase 8 | 🔲 Pending | Authentication / user management |

---

## Current Status

The application is fully functional end-to-end:

- Evidence can be uploaded manually via the Submit page
- The AI agent can navigate any web portal based on a natural language prompt
- Screenshots are automatically saved and displayed in the Agent UI
- Full submission history is tracked in the database

**Known limitation:** Local LLMs (llama3.2, qwen2.5:7b) are less reliable than cloud models (Gemini, Claude) for complex multi-step portal navigation. For production use, a cloud LLM API key is recommended.
