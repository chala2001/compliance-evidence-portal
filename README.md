# Compliance Evidence Submission Portal

An AI-powered internal tool for **WSO2** that automates compliance evidence collection. Instead of an engineer manually opening Azure Portal, taking a screenshot, and emailing it to the compliance team, this portal lets you either upload evidence manually or describe what you want in plain English and let an AI agent navigate a real browser to capture it for you — automatically saving the file and creating a full audit trail in PostgreSQL.

---

## Table of Contents

- [1. The Problem & The Solution](#1-the-problem--the-solution)
- [2. System Architecture](#2-system-architecture)
- [3. Tech Stack](#3-tech-stack)
- [4. Project Structure](#4-project-structure)
- [5. Database Schema](#5-database-schema)
- [6. Data Flow — How Each User Action Works](#6-data-flow--how-each-user-action-works)
- [7. The AI Agent Layer](#7-the-ai-agent-layer)
- [8. Submission Status Workflow](#8-submission-status-workflow)
- [9. API Endpoints](#9-api-endpoints)
- [10. Setup & Installation](#10-setup--installation)
- [11. Running the Application](#11-running-the-application)
- [12. LLM Provider Configuration](#12-llm-provider-configuration)
- [13. Cost Estimates](#13-cost-estimates)
- [14. Build Phases & Roadmap](#14-build-phases--roadmap)
- [15. Troubleshooting](#15-troubleshooting)

---

## 1. The Problem & The Solution

### The real-world problem

WSO2 is subject to multiple compliance frameworks — **SOC2**, **PCI-DSS**, **HIPAA** — and each requires evidence (screenshots, configs, audit logs) proving that internal security controls are being followed. Today this is done manually:

1. An engineer opens Azure Portal / AWS Console / ServiceNow
2. Navigates to the relevant setting
3. Takes a screenshot
4. Emails it or uploads it to Confluence with a note

This is slow, has no central record, and is error-prone.

### What this project delivers

A web app with **two complementary layers**:

| Layer | Purpose |
|---|---|
| **Evidence Portal** | A UI where engineers upload evidence files, tag them to compliance controls, and review a full audit trail of who submitted what. |
| **AI Agent** | A natural-language interface — describe what to capture, and an LLM-driven browser navigates the portal and saves the screenshot automatically, linked to the right control. |

> ⚠️ This automates the **practical** parts of evidence collection. Public pages, simple navigations, and well-structured portals work great. MFA login flows, captchas, and ambiguous multi-step tasks still need a human.

---

## 2. System Architecture

```mermaid
graph TB
    subgraph Browser["👤 User's Browser"]
        UI[React Frontend<br/>localhost:5173]
    end

    subgraph Server["🖥️ Local Server"]
        API[FastAPI Backend<br/>localhost:8000]
        Agent[AI Agent Layer<br/>browser-use + Playwright]
        Chrome[Real Chrome Browser<br/>headless=false]
    end

    subgraph Storage["💾 Storage"]
        DB[(PostgreSQL<br/>Docker container<br/>localhost:5432)]
        Disk[Local Filesystem<br/>backend/uploads/]
    end

    subgraph Cloud["☁️ External LLM"]
        LLM[Azure OpenAI / Claude /<br/>Gemini / Ollama]
    end

    UI -->|REST / JSON| API
    API -->|SQLAlchemy ORM| DB
    API -->|save_file / delete_file| Disk
    API -->|run_agent prompt| Agent
    Agent -->|"decide next action"| LLM
    LLM -->|"click / type / navigate"| Agent
    Agent -->|Playwright DevTools Protocol| Chrome
    Chrome -->|HTTP| Internet[(🌐 Internet<br/>Azure Portal, etc.)]
    Chrome -.->|screenshot bytes| Agent
    Agent -->|"final screenshot + result"| API

    classDef browser fill:#FFF4E5,stroke:#FF7300,color:#1a1a2e
    classDef server fill:#E5F3FF,stroke:#2E7DFA,color:#1a1a2e
    classDef storage fill:#E8F8EE,stroke:#22C55E,color:#1a1a2e
    classDef cloud fill:#F3E8FF,stroke:#A855F7,color:#1a1a2e

    class UI browser
    class API,Agent,Chrome server
    class DB,Disk storage
    class LLM cloud
```

**Key idea — separation of concerns:**

- **Frontend** only renders UI and sends HTTP requests; it has no business logic
- **Backend** owns all rules, the database, file storage, and the AI agent
- **Database** stores **metadata** (titles, file names, who submitted, etc.) — not the files
- **Files** (PNGs, PDFs) live on disk in `backend/uploads/`, served as static files at `/uploads/<uuid>.png`
- **LLM** is pluggable: Ollama (free, local), Azure OpenAI, Anthropic Claude, or Google Gemini

---

## 3. Tech Stack

### Backend

| Tool | Purpose |
|---|---|
| **Python 3.11** | Language |
| **FastAPI** | Web framework (async, auto-generated OpenAPI docs) |
| **Pydantic v2** | Request/response validation |
| **SQLAlchemy 2** | ORM — talk to Postgres using Python classes |
| **Alembic** | Database schema migrations |
| **PostgreSQL 16** | The database (runs in Docker) |
| **psycopg2-binary** | Postgres driver |
| **browser-use** | Library that connects an LLM to a real browser |
| **Playwright** | Controls real Chrome via Chrome DevTools Protocol |
| **uvicorn** | ASGI server that runs FastAPI |

### Frontend

| Tool | Purpose |
|---|---|
| **React 19** | UI library |
| **TypeScript** | Static type checking |
| **Vite** | Dev server + production bundler |
| **Material UI (MUI) v5** | Component library |
| **@oxygen-ui/react** | WSO2's design system (used alongside MUI) |
| **@oxygen-ui/react-icons** | WSO2 icon set (used instead of MUI icons due to React 19 compat) |
| **TanStack React Query v5** | Data fetching + caching |
| **Axios** | HTTP client |
| **React Router v7** | Client-side routing |

### LLM providers (any one)

| Provider | Notes |
|---|---|
| **Azure OpenAI** | Recommended for production. Supports gpt-4o-mini, gpt-4.1-mini, gpt-5-mini, gpt-5.4-mini, etc. |
| **Anthropic Claude** | High quality, more expensive. Recommended model: `claude-haiku-4-5` |
| **Google Gemini** | Cheapest cloud option; has a generous free tier. Recommended model: `gemini-2.0-flash` |
| **Ollama** | Free, local, no API key. Recommended model: `qwen2.5:7b`. Weaker on multi-step tasks. |

---

## 4. Project Structure

```
Compliance-Evidence-Submission-Portal/
│
├── backend/                          # FastAPI Python server
│   ├── app/
│   │   ├── main.py                   # FastAPI app, CORS, /uploads static mount
│   │   ├── config.py                 # Pydantic settings (reads .env)
│   │   ├── database.py               # SQLAlchemy engine + session + Base
│   │   ├── seed.py                   # One-time: load SOC2/PCI-DSS/HIPAA into DB
│   │   │
│   │   ├── models/                   # SQLAlchemy ORM models (the DB tables)
│   │   │   ├── framework.py          # frameworks table
│   │   │   ├── control.py            # controls table
│   │   │   ├── evidence.py           # evidence table (with cascade delete)
│   │   │   └── submission.py         # submissions table (audit trail)
│   │   │
│   │   ├── schemas/                  # Pydantic request/response shapes
│   │   │   ├── framework.py
│   │   │   ├── control.py
│   │   │   ├── evidence.py
│   │   │   └── submission.py
│   │   │
│   │   ├── api/routes/               # FastAPI route handlers
│   │   │   ├── frameworks.py         # GET/POST /api/frameworks
│   │   │   ├── controls.py           # GET/POST /api/controls
│   │   │   ├── evidence.py           # Upload/delete files + auto-create submission
│   │   │   ├── submissions.py        # List submissions
│   │   │   └── agent.py              # POST /api/agent/run — run the AI
│   │   │
│   │   ├── agent/
│   │   │   └── runner.py             # LLM + browser-use orchestration
│   │   │
│   │   └── storage/
│   │       └── local_storage.py      # save_file / delete_file (swap for Azure Blob later)
│   │
│   ├── alembic/                      # DB migration scripts
│   ├── uploads/                      # Stored evidence files (gitignored)
│   ├── .env                          # Secrets — NOT committed
│   └── requirements.txt
│
├── frontend/                         # React UI
│   ├── src/
│   │   ├── main.tsx                  # React entry; MUI theme + React Query setup
│   │   ├── App.tsx                   # Router setup (5 pages)
│   │   ├── index.css                 # Minimal global CSS (mostly for agent log box)
│   │   │
│   │   ├── api/client.ts             # ALL backend HTTP calls (Axios)
│   │   │
│   │   ├── components/
│   │   │   └── Navbar.tsx            # Top navigation bar
│   │   │
│   │   └── pages/                    # One file per visible page
│   │       ├── Dashboard.tsx         # Stat cards + recent submissions
│   │       ├── EvidenceList.tsx      # Browse + delete evidence
│   │       ├── SubmitEvidence.tsx    # Manual upload form
│   │       ├── SubmissionHistory.tsx # Full audit trail
│   │       └── AgentRunner.tsx       # Natural-language agent prompt UI
│   │
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yml                # PostgreSQL service
├── README.md                         # This file
└── PROJECT_EXPLAINED.md              # Beginner-friendly companion guide
```

---

## 5. Database Schema

Four tables stacked in a hierarchy: **framework** → **control** → **evidence** → **submission**.

```mermaid
erDiagram
    FRAMEWORK ||--o{ CONTROL : "has many"
    CONTROL ||--o{ EVIDENCE : "evidenced by"
    EVIDENCE ||--o{ SUBMISSION : "submitted as"

    FRAMEWORK {
        int id PK
        string name "SOC2, PCI-DSS, HIPAA"
        string description
    }

    CONTROL {
        int id PK
        int framework_id FK
        string control_ref "CC6.1, Req 8.2, etc."
        string title
        string description
    }

    EVIDENCE {
        int id PK
        int control_id FK
        string title
        string description
        string file_name "uuid.png"
        string file_url "/uploads/uuid.png"
        datetime created_at
        datetime updated_at
    }

    SUBMISSION {
        int id PK
        int evidence_id FK
        string submitted_by "ai-agent | manual-user | name"
        string status "pending | approved | rejected"
        string notes
        datetime submitted_at
    }
```

### What each entity means (in plain English)

| Entity | Real-world analogy |
|---|---|
| **Framework** | A whole compliance standard (a textbook) |
| **Control** | One specific rule inside that standard (a chapter) |
| **Evidence** | A file that proves you follow ONE rule (homework turned in) |
| **Submission** | The "received from X on date Y, status pending" stamp |

### Cascade behavior

When an `evidence` row is deleted:
1. Its related `submission` rows are auto-deleted (via SQLAlchemy `cascade="all, delete-orphan"`)
2. The physical file on disk is removed (via `delete_file()` in [local_storage.py](backend/app/storage/local_storage.py))

This keeps the DB and disk in sync.

### Pre-seeded data

[`backend/app/seed.py`](backend/app/seed.py) populates the DB once with 3 frameworks and 38 controls:

| Framework | # Controls |
|---|---|
| SOC2 | 12 |
| PCI-DSS | 14 |
| HIPAA | 12 |

---

## 6. Data Flow — How Each User Action Works

### 6.1 Manual evidence upload

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend<br/>SubmitEvidence.tsx
    participant BE as Backend<br/>routes/evidence.py
    participant DB as PostgreSQL
    participant FS as uploads/ folder

    User->>FE: Pick Framework → SOC2
    FE->>BE: GET /api/frameworks/
    BE->>DB: SELECT * FROM frameworks
    DB-->>BE: 3 rows
    BE-->>FE: JSON array

    User->>FE: Pick Control → CC6.2
    FE->>BE: GET /api/controls/?framework_id=1
    BE->>DB: SELECT * FROM controls WHERE framework_id=1
    DB-->>BE: 12 rows
    BE-->>FE: JSON array

    User->>FE: Fill title, attach file, Submit
    FE->>BE: POST /api/evidence/ (multipart/form-data)

    BE->>FS: Save file as uuid.png
    FS-->>BE: ok
    BE->>DB: INSERT INTO evidence (...)
    DB-->>BE: id=42
    BE->>DB: INSERT INTO submissions (evidence_id=42, submitted_by='manual-user', status='pending')
    DB-->>BE: id=17

    BE-->>FE: 201 Created (evidence row)
    FE-->>User: ✅ "Evidence submitted successfully"
```

### 6.2 AI agent flow (with auto-link to control)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend<br/>AgentRunner.tsx
    participant BE as Backend<br/>routes/agent.py
    participant Runner as agent/runner.py
    participant LLM as Azure OpenAI
    participant Browser as Chrome<br/>(real window)
    participant DB as PostgreSQL
    participant FS as uploads/ folder

    User->>FE: Pick framework + control, type prompt, click Run
    FE->>BE: POST /api/agent/run<br/>{ prompt, control_id, title }
    BE->>DB: Verify control exists
    DB-->>BE: ok
    BE->>Runner: run_agent(prompt)
    Runner->>Browser: Open new Chrome session

    loop Up to 15 steps
        Runner->>LLM: Send DOM snapshot + history
        LLM-->>Runner: Decide next action (click, type, etc.)
        Runner->>Browser: Execute action via Playwright
        Browser-->>Runner: New page state
    end

    Runner->>Browser: Take final screenshot
    Browser-->>Runner: PNG bytes (base64)
    Runner->>FS: Write uuid.png
    Runner-->>BE: { result, screenshot_url, file_name }

    BE->>DB: INSERT INTO evidence (control_id=..., file_name=...)
    DB-->>BE: id=43
    BE->>DB: INSERT INTO submissions (evidence_id=43, submitted_by='ai-agent', status='pending')
    DB-->>BE: id=18

    BE-->>FE: { result, screenshot_url, evidence_id: 43, submission_id: 18 }
    FE-->>User: ✅ Green banner + screenshot displayed
```

### 6.3 Evidence list page

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend<br/>EvidenceList.tsx
    participant BE as Backend
    participant DB as PostgreSQL

    User->>FE: Visit /evidence
    par
        FE->>BE: GET /api/evidence/
        BE->>DB: SELECT * FROM evidence
        DB-->>BE: rows
        BE-->>FE: JSON
    and
        FE->>BE: GET /api/frameworks/
        BE->>DB: SELECT * FROM frameworks
        DB-->>BE: rows
        BE-->>FE: JSON
    and
        FE->>BE: GET /api/controls/
        BE->>DB: SELECT * FROM controls
        DB-->>BE: rows
        BE-->>FE: JSON
    end
    FE-->>User: Render table with control_ref resolved from control_id

    User->>FE: Click Delete on a row
    FE->>BE: DELETE /api/evidence/42
    BE->>DB: Cascade DELETE evidence + linked submissions
    BE->>BE: Remove file from disk
    BE-->>FE: 204 No Content
    FE->>FE: Invalidate ['evidence'] query cache
    FE-->>User: Row disappears from table
```

---

## 7. The AI Agent Layer

This is the most interesting part of the project. The agent connects a Large Language Model to a real Chrome browser via the [`browser-use`](https://github.com/browser-use/browser-use) library.

### 7.1 The brain / muscle / eyes / body metaphor

```mermaid
flowchart TB
    User["👤 You type a prompt"] --> Brain

    subgraph Loop["Loop up to 15 steps"]
        Brain["🧠 BRAIN<br/>LLM<br/>(Azure OpenAI / Claude /<br/>Gemini / Ollama)"]
        Eyes["👀 EYES<br/>browser-use's<br/>DOM + screenshot reader"]
        Muscle["💪 MUSCLE<br/>browser-use<br/>action executor"]
        Nerves["🦴 NERVES<br/>Playwright<br/>(DevTools Protocol)"]
        Body["🖥️ BODY<br/>Real Chrome<br/>(headless=false)"]
        World["🌐 OUTSIDE WORLD<br/>Web pages"]

        Brain -->|"decide: click X"| Muscle
        Muscle -->|"page.click(...)"| Nerves
        Nerves -->|"CDP command"| Body
        Body -->|"renders page"| World
        World -->|"HTML, JS, network"| Body
        Body -->|"DOM + screenshot"| Eyes
        Eyes -->|"feed back to brain"| Brain
    end

    Loop --> Final["📸 Take final screenshot<br/>Save to uploads/uuid.png"]
    Final --> DBWrite["💾 INSERT evidence + submission<br/>(if control_id picked)"]
    DBWrite --> Response["📤 Return result to UI"]

    classDef brain fill:#FFE4E1,stroke:#FF6B6B
    classDef muscle fill:#E1F0FF,stroke:#2E7DFA
    classDef body fill:#E8F8EE,stroke:#22C55E
    class Brain brain
    class Muscle,Nerves muscle
    class Eyes,Body,World body
```

| Role | What | Has it costly per step? |
|---|---|---|
| **Brain** | LLM — decides what to do next | ✅ Yes — every step is a paid LLM call |
| **Eyes** | Reads page DOM + screenshots back into brain context | Adds tokens to brain's input |
| **Muscle** | Translates "click button X" into a Playwright command | Free |
| **Nerves** | Playwright + Chrome DevTools Protocol | Free |
| **Body** | Real Chrome browser running on your machine | Free |

**Only the LLM costs money.** Everything else is local.

### 7.2 What the agent CAN do today

- ✅ Navigate to any URL
- ✅ Click buttons, links, menus
- ✅ Type into input fields
- ✅ Scroll up/down
- ✅ Read page text
- ✅ Switch tabs
- ✅ Wait for elements

### 7.3 What it cannot do (yet)

- ❌ Log in to portals requiring MFA / 2FA
- ❌ Solve captchas
- ❌ Save intermediate screenshots (only the final page is captured)
- ❌ Resume sessions across runs (fresh browser every time)
- ❌ Run multiple tasks in parallel

---

## 8. Submission Status Workflow

Every submission has a `status` field. It tracks where the submission is in the review process.

```mermaid
stateDiagram-v2
    [*] --> pending : Submitted<br/>(manual or AI)
    pending --> approved : Reviewer accepts
    pending --> rejected : Reviewer rejects
    rejected --> pending : Re-submitted
    approved --> [*]
    rejected --> [*]
```

| Status | Meaning |
|---|---|
| **pending** | Just submitted, no reviewer has acted yet. **Default for every new submission.** |
| **approved** | Accepted as valid compliance evidence. Counts toward the framework. |
| **rejected** | Reviewer found it insufficient. Doesn't count; needs re-submission. |

> ⚠️ **The current build does not yet have a Review UI.** All submissions stay at `pending` forever. The DB column is ready — only the UI is missing. This is the next planned feature (see [Roadmap](#14-build-phases--roadmap)).

---

## 9. API Endpoints

All endpoints are prefixed with `/api`. Auto-generated docs at `http://localhost:8000/docs`.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/api/frameworks/` | List all frameworks |
| `POST` | `/api/frameworks/` | Create a framework |
| `GET` | `/api/frameworks/{id}` | Get one framework |
| `GET` | `/api/controls/?framework_id={id}` | List controls (optionally filtered) |
| `POST` | `/api/controls/` | Create a control |
| `GET` | `/api/controls/{id}` | Get one control |
| `GET` | `/api/evidence/` | List all evidence |
| `POST` | `/api/evidence/` | **Upload file + create evidence + create submission** |
| `GET` | `/api/evidence/{id}` | Get one evidence row |
| `DELETE` | `/api/evidence/{id}` | Delete evidence + cascade submissions + remove file |
| `GET` | `/api/submissions/` | List all submissions (audit trail) |
| `POST` | `/api/submissions/` | Create a submission manually |
| `GET` | `/api/submissions/{id}` | Get one submission |
| `POST` | `/api/agent/run` | **Run AI agent — optionally creates evidence + submission** |
| `GET` | `/uploads/{file_name}` | Serve a stored file (static) |

### Example: AI agent request body

```json
{
  "prompt": "Go to wikipedia.org and take a screenshot",
  "control_id": 2,            // Optional — if provided, auto-creates evidence + submission
  "title": "Wikipedia capture", // Optional — defaults to first 80 chars of prompt
  "submitted_by": "ai-agent"  // Optional — defaults to "ai-agent"
}
```

---

## 10. Setup & Installation

### Prerequisites

| Tool | Why |
|---|---|
| Python 3.11+ | Backend language |
| Node.js 20+ | Frontend toolchain |
| Docker + Docker Compose | Runs PostgreSQL |
| Google Chrome | Used by the AI agent |
| Ollama (optional) | For free local LLM |

### Backend setup

```bash
cd backend

# Create venv with Python 3.11 (NOT 3.10 — browser-use requires 3.11+)
python3.11 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
pip install alembic browser-use playwright \
            langchain-anthropic langchain-google-genai langchain-openai
python -m playwright install chromium
```

### Environment file

Create `backend/.env`:

```env
DATABASE_URL=postgresql://complianceuser:compliancepass@localhost:5432/compliance_db

# Pick ONE provider
AGENT_PROVIDER=azure
AGENT_MODEL=gpt-4.1-mini

# Azure OpenAI (if AGENT_PROVIDER=azure)
AZURE_OPENAI_API_KEY=your-key-from-azure-portal
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini
AZURE_OPENAI_API_VERSION=2024-10-21

# Anthropic Claude (if AGENT_PROVIDER=anthropic)
ANTHROPIC_API_KEY=

# Google Gemini (if AGENT_PROVIDER=gemini)
GEMINI_API_KEY=
```

### Database migration + seed

```bash
# In backend/ with venv active
alembic upgrade head      # Create the 4 tables
python -m app.seed        # Load SOC2, PCI-DSS, HIPAA + 38 controls
```

### Frontend setup

```bash
cd frontend
npm install
```

---

## 11. Running the Application

You need **three things** running at once. Use three terminals.

```mermaid
graph LR
    A[Terminal 1<br/>docker compose up -d<br/>Postgres → port 5432] --> B[Terminal 2<br/>uvicorn app.main:app<br/>Backend → port 8000]
    B --> C[Terminal 3<br/>npm run dev<br/>Frontend → port 5173]
    C --> D[Open browser<br/>http://localhost:5173]
```

### Daily startup commands

```bash
# Terminal 1 — Postgres (from project root)
docker compose up -d

# Terminal 2 — Backend (from backend/, venv active)
source venv/bin/activate
uvicorn app.main:app --reload --port 8000 2>&1 | tee /tmp/backend.log

# Terminal 3 — Frontend (from frontend/)
npm run dev
```

### Quick health check

Run this any time to verify all three services:

```bash
echo "Postgres: $(docker ps --filter ancestor=postgres:16 --format '{{.Status}}' 2>/dev/null || echo DOWN)"
echo "Backend:  HTTP $(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/health)"
echo "Frontend: HTTP $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173)"
```

You should see:
```
Postgres: Up X hours
Backend:  HTTP 200
Frontend: HTTP 200
```

---

## 12. LLM Provider Configuration

Switch providers by changing `AGENT_PROVIDER` in `backend/.env`. No code changes needed.

```mermaid
flowchart LR
    ENV[".env<br/>AGENT_PROVIDER=?"]
    ENV --> A{provider}
    A -->|azure| AZ[ChatAzureOpenAI<br/>browser_use native]
    A -->|anthropic| AN[ChatAnthropic<br/>LangChain wrapper]
    A -->|gemini| GE[ChatGoogleGenerativeAI<br/>LangChain wrapper]
    A -->|ollama| OL[ChatOllama<br/>browser_use native]
    AZ --> Agent[Agent loop]
    AN --> Agent
    GE --> Agent
    OL --> Agent
```

Implementation lives in [`backend/app/agent/runner.py`](backend/app/agent/runner.py) → `_build_llm()`.

| Provider | `.env` value | Notes |
|---|---|---|
| Azure OpenAI | `AGENT_PROVIDER=azure` + AZURE_OPENAI_* | Recommended for production; uses browser-use's native `ChatAzureOpenAI` |
| Anthropic | `AGENT_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` | High quality, slightly pricier |
| Google Gemini | `AGENT_PROVIDER=gemini` + `GEMINI_API_KEY` | Cheapest cloud option, generous free tier |
| Ollama | `AGENT_PROVIDER=ollama` | Free, local — start `ollama serve` first |

---

## 13. Cost Estimates

For a typical `browser-use` agent run (~10 steps, ~80K input + 4K output tokens):

| Model | Approx cost per run | $40 budget buys |
|---|---|---|
| Gemini 2.5 Flash | ~$0.03 | ~1,300 runs |
| GPT-4o-mini (Azure) | ~$0.015 | ~2,500 runs |
| GPT-4.1-mini (Azure) | ~$0.04 | ~1,000 runs |
| GPT-5-mini (Azure) | ~$0.05 | ~800 runs |
| Claude Haiku 4.5 | ~$0.10 | ~400 runs |
| Claude Sonnet 4.6 | ~$0.25 | ~160 runs |
| Ollama qwen2.5:7b | $0 | unlimited (but lower quality) |

> 💡 Always set a **billing budget alert** in your LLM provider's dashboard. For Azure: Cost Management → Budgets → set monthly cap + email alert.

---

## 14. Build Phases & Roadmap

```mermaid
graph LR
    P1[Phase 1<br/>✅ FastAPI skeleton<br/>DB + Docker]
    P2[Phase 2<br/>✅ SQLAlchemy models<br/>Alembic migrations]
    P3[Phase 3<br/>✅ REST API routes]
    P4[Phase 4<br/>✅ Local file storage]
    P5[Phase 5<br/>✅ React + MUI<br/>+ Oxygen UI frontend]
    P6[Phase 6<br/>✅ AI agent<br/>browser-use]
    P7[Phase 7<br/>✅ Agent → DB<br/>auto-link]
    P8[Phase 8<br/>🔲 Review UI<br/>approve/reject]
    P9[Phase 9<br/>🔲 Azure Blob<br/>storage swap]
    P10[Phase 10<br/>🔲 Authentication<br/>Azure AD / Entra]

    P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7 --> P8 --> P9 --> P10
```

### Done

| Phase | Status |
|---|---|
| 1. FastAPI skeleton, DB connection, Docker | ✅ |
| 2. SQLAlchemy models + Alembic migrations | ✅ |
| 3. REST API endpoints for all resources | ✅ |
| 4. Local file storage with upload/delete | ✅ |
| 5. React frontend with MUI + Oxygen UI | ✅ |
| 6. AI agent (browser-use + multi-provider LLM) | ✅ |
| 7. Agent output auto-creates evidence + submission rows | ✅ |
| 7b. Manual upload also creates submission row | ✅ |
| 7c. Cascade delete (file + DB rows in sync) | ✅ |

### Planned

| Phase | Description |
|---|---|
| 8. **Review workflow** | UI for reviewers to change status: pending → approved/rejected, with reviewer name + comment. |
| 9. **Azure Blob storage** | Swap [`local_storage.py`](backend/app/storage/local_storage.py) for an Azure Blob implementation. Same function signatures — drop-in. |
| 10. **Authentication** | Add Azure AD / Entra ID login. Replace hardcoded `submitted_by` strings with the logged-in user. |
| Optional | Live agent progress (Server-Sent Events), parallel agent runs, full pytest suite, GitHub Actions CI. |

---

## 15. Troubleshooting

### Backend won't connect to Postgres

```
sqlalchemy.exc.OperationalError: connection to server failed: Connection refused
```

→ PostgreSQL container is down. Fix:
```bash
docker compose up -d
```

### `ModuleNotFoundError: alembic`

→ Alembic wasn't installed by `pip install -r requirements.txt` (not in the file). Install separately:
```bash
pip install alembic
```

### Frontend shows blank page

Open DevTools (F12) → Console. Common cause: **MUI v5 icons are incompatible with React 19**. Use `@oxygen-ui/react-icons` instead. All existing code uses Oxygen icons; if you add a new icon, follow the same pattern.

### CORS errors in browser

```
Cross-Origin Request Blocked. Status code: (null)
```

→ Despite the message, this usually means the **backend isn't running** (no response = no CORS headers). Start the backend.

### Port 8000 already in use

```bash
kill $(lsof -t -i:8000)
```

### Two Vite servers running on 5173 and 5174

```bash
kill $(lsof -t -i:5173) $(lsof -t -i:5174) 2>/dev/null
sleep 2
npm run dev
```

### Agent screenshot saved but not in Evidence list

You ran the agent without picking a framework + control. The screenshot stays as a loose file in `uploads/`; no DB row is created. To save as evidence, pick a control on the Agent page before clicking Run.

### DB rows reference files that don't exist (or vice versa)

Cleanup orphan DB rows:
```bash
docker exec -i $(docker ps -q --filter "ancestor=postgres:16") psql -U complianceuser -d compliance_db -c \
  "DELETE FROM evidence WHERE file_name NOT IN (SELECT 'placeholder');"
```

(Replace the subquery with the actual file_names you want to keep, or write a Python script that compares disk and DB.)

---

## License & Contributing

Internal WSO2 project. For questions or issues, contact the maintainers.

See [PROJECT_EXPLAINED.md](PROJECT_EXPLAINED.md) for a beginner-friendly walkthrough complementary to this technical README.
