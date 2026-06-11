# Compliance Evidence Submission Portal

An AI-powered internal tool for **WSO2** that automates compliance evidence collection. An engineer describes — in plain English — what screenshot to capture from Azure / AWS / WSO2 / any web portal, and an AI agent drives a real Chrome browser to capture it. The result is saved as an `Evidence` row linked to the right compliance control, with a full submission audit trail in PostgreSQL.

The agent **never sees credentials**. The user logs in once (with MFA) through a guided two-step flow; the session is reused across runs. While the agent runs, the user can pause, intervene, modify the next task in plain English, and resume — all from the same UI.

---

## Table of Contents

- [1. The Problem & The Solution](#1-the-problem--the-solution)
- [2. System Architecture](#2-system-architecture)
- [3. Tech Stack](#3-tech-stack)
- [4. Project Structure](#4-project-structure)
- [5. Database Schema](#5-database-schema)
- [6. The AI Agent Pipeline](#6-the-ai-agent-pipeline)
- [7. Data Flow — How Each User Action Works](#7-data-flow--how-each-user-action-works)
- [8. Submission Status Workflow](#8-submission-status-workflow)
- [9. API Endpoints](#9-api-endpoints)
- [10. Setup & Installation](#10-setup--installation)
- [11. Running the Application](#11-running-the-application)
- [12. LLM Provider Configuration](#12-llm-provider-configuration)
- [13. Cost Estimates](#13-cost-estimates)
- [14. Build Phases & Roadmap](#14-build-phases--roadmap)
- [15. Security Properties](#15-security-properties)
- [16. Troubleshooting](#16-troubleshooting)

---

## 1. The Problem & The Solution

### The real-world problem

WSO2 is subject to multiple compliance frameworks — **SOC2**, **PCI-DSS**, **HIPAA** — and each requires evidence (screenshots, configs, audit logs) proving that internal security controls are being followed. The legacy workflow is:

1. An engineer opens Azure Portal / AWS Console / ServiceNow
2. Navigates through tabs/regions/services to the relevant resource
3. Takes a screenshot
4. Renames it, emails it, or uploads it to Confluence with a note

Multiplied by **38 controls across 3 frameworks**, this is slow, has no central record, can't be re-run consistently, and breaks the moment the engineer forgets a screenshot.

### What this project delivers

A web app with **two complementary layers**:

| Layer | Purpose |
|---|---|
| **Evidence Portal** | A UI where engineers upload evidence manually, tag it to compliance controls, and review the full audit trail. |
| **AI Agent** | A natural-language interface — describe what to capture, and an LLM-driven browser navigates the portal and saves the screenshot(s) automatically, linked to the right control. |

The AI agent supports **MFA-protected cloud portals** through a human-in-the-loop authentication flow:

> *The user logs in manually (with MFA) once. The browser session persists. The agent reuses the authenticated session for all subsequent runs. The agent itself is explicitly forbidden from typing credentials.*

---

## 2. System Architecture

```mermaid
graph TB
    subgraph Browser["User's Web Browser"]
        UI[React Frontend<br/>localhost:5173<br/>Polls /runs/&#123;id&#125; every 1.5s]
    end

    subgraph Server["Local FastAPI Server"]
        API[REST API<br/>localhost:8000]
        RunStore[(In-memory RUNS dict<br/>run_id → state)]
        Runner[Agent Runner<br/>_execute_run async loop]
        Chrome[Persistent Chrome<br/>shared BrowserSession<br/>keep_alive=true]
    end

    subgraph Storage["Persistent Storage"]
        Profile[backend/browser_profile/<br/>cookies, login session]
        Disk[backend/uploads/<br/>screenshot PNGs]
        DB[(PostgreSQL<br/>Docker, port 5432)]
    end

    subgraph Cloud["LLM Provider"]
        LLM[Azure OpenAI / Claude /<br/>Gemini / Ollama]
    end

    UI -->|POST /agent/start-run| API
    UI -->|GET /agent/runs/&#123;id&#125;| API
    UI -->|POST /agent/pause &amp; /resume| API
    UI -->|POST /runs/&#123;id&#125;/modify-next| API

    API -->|asyncio.create_task| Runner
    API -->|read state| RunStore
    Runner -->|write state| RunStore

    Runner -->|Playwright CDP| Chrome
    Chrome <-->|reads/writes cookies| Profile
    Chrome -->|HTTP| Internet[("Azure Portal,<br/>AWS Console, etc.")]
    Chrome -.->|screenshot bytes| Runner
    Runner -->|save PNG| Disk
    Runner -->|"Evidence + Submission rows<br/>(one per task)"| DB

    Runner -->|"decide: click / type / scroll"| LLM
    LLM -->|action| Runner

    classDef browser fill:#FFF4E5,stroke:#FF7300,color:#1a1a2e
    classDef server fill:#E5F3FF,stroke:#2E7DFA,color:#1a1a2e
    classDef storage fill:#E8F8EE,stroke:#22C55E,color:#1a1a2e
    classDef cloud fill:#F3E8FF,stroke:#A855F7,color:#1a1a2e

    class UI browser
    class API,Runner,Chrome,RunStore server
    class DB,Disk,Profile storage
    class LLM cloud
```

**Key architectural decisions:**

- **Frontend** only renders UI and sends HTTP. No business logic.
- **Backend** owns rules, DB, file storage, and the AI agent loop.
- **Persistent Chrome session** — one shared `BrowserSession` for the life of the backend process. Cookies live in `backend/browser_profile/` and survive backend restarts.
- **In-memory run state** (`RUNS` dict) — each agent run gets a `run_id`; live state is read by the frontend via polling. Survives only the backend process; runs are not resumable across restarts (acceptable for an internal tool).
- **Incremental persistence** — each completed subtask immediately writes its `Evidence` + `Submission` rows. A crash mid-run doesn't lose completed work.
- **LLM is pluggable** — Ollama (local), Azure OpenAI, Anthropic Claude, or Google Gemini.

---

## 3. Tech Stack

### Backend

| Tool | Purpose |
|---|---|
| **Python 3.11** | Language |
| **FastAPI** | Async web framework with auto-generated OpenAPI docs |
| **Pydantic v2** | Request/response validation |
| **SQLAlchemy 2** | ORM |
| **Alembic** | DB schema migrations |
| **PostgreSQL 16** | Database (Docker) |
| **browser-use 0.12+** | Connects an LLM to a real browser via Playwright |
| **Playwright** | Drives Chrome through the DevTools Protocol |
| **asyncio** | Background runs + pause/resume signaling |
| **uvicorn** | ASGI server |

### Frontend

| Tool | Purpose |
|---|---|
| **React 19** | UI library |
| **TypeScript** | Static type checking |
| **Vite 8** | Dev server + production bundler |
| **Material UI (MUI) v5** | Component library |
| **@oxygen-ui/react** | WSO2's design system, layered on top of MUI |
| **@oxygen-ui/react-icons** | WSO2 icon set (used instead of MUI icons due to React 19 compat) |
| **TanStack React Query v5** | Data fetching + caching for Evidence/History tabs |
| **Axios** | HTTP client |
| **React Router v7** | Client-side routing |

### LLM providers (pick one)

| Provider | Notes |
|---|---|
| **Azure OpenAI** | Recommended for production. `gpt-4o-mini`, `gpt-4.1-mini`, `gpt-5-mini`. |
| **Anthropic Claude** | High quality, slightly pricier. `claude-haiku-4-5-20251001`. |
| **Google Gemini** | Cheapest cloud option. `gemini-2.0-flash`. |
| **Ollama** | Free, local, weaker on multi-step tasks. `qwen2.5:7b`. |

---

## 4. Project Structure

```
Compliance-Evidence-Submission-Portal/
│
├── backend/                          # FastAPI Python server
│   ├── app/
│   │   ├── main.py                   # FastAPI app, CORS, /uploads static mount
│   │   ├── config.py                 # Pydantic settings (reads .env)
│   │   ├── database.py               # SQLAlchemy engine, SessionLocal, Base
│   │   ├── seed.py                   # One-time: load SOC2/PCI-DSS/HIPAA controls
│   │   │
│   │   ├── models/                   # SQLAlchemy ORM (the DB tables)
│   │   │   ├── framework.py
│   │   │   ├── control.py
│   │   │   ├── evidence.py
│   │   │   └── submission.py
│   │   │
│   │   ├── schemas/                  # Pydantic request/response shapes
│   │   │
│   │   ├── api/routes/               # FastAPI route handlers
│   │   │   ├── frameworks.py
│   │   │   ├── controls.py
│   │   │   ├── evidence.py
│   │   │   ├── submissions.py
│   │   │   └── agent.py              # All agent endpoints (open-portal, start-run,
│   │   │                             #   pause, resume, runs/{id}, modify-next, ...)
│   │   │
│   │   ├── agent/
│   │   │   └── runner.py             # The whole agent pipeline:
│   │   │                             #   - AGENT_INSTRUCTIONS prompt prefix
│   │   │                             #   - parse_subtasks() for numbered/bulleted prompts
│   │   │                             #   - _shared_browser singleton + persistent profile
│   │   │                             #   - _pause_event for pause/resume
│   │   │                             #   - RUNS dict (live run state)
│   │   │                             #   - _execute_run() background coroutine
│   │   │
│   │   └── storage/
│   │       └── local_storage.py      # save_file / delete_file (swap for Azure Blob later)
│   │
│   ├── alembic/                      # DB migration scripts
│   ├── uploads/                      # Stored screenshot PNGs (gitignored)
│   ├── browser_profile/              # Persistent Chrome profile (cookies, session) - gitignored
│   ├── .env                          # Secrets — NOT committed
│   └── requirements.txt
│
├── frontend/                         # React UI
│   ├── src/
│   │   ├── main.tsx                  # React entry; MUI theme + React Query setup
│   │   ├── App.tsx                   # Router setup (5 pages)
│   │   ├── index.css                 # Minimal global CSS
│   │   │
│   │   ├── api/client.ts             # ALL backend HTTP calls (Axios)
│   │   │
│   │   ├── components/
│   │   │   └── Navbar.tsx
│   │   │
│   │   └── pages/
│   │       ├── Dashboard.tsx
│   │       ├── EvidenceList.tsx
│   │       ├── SubmitEvidence.tsx
│   │       ├── SubmissionHistory.tsx
│   │       └── AgentRunner.tsx       # Two-step UI, run timeline, modify-next textarea
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

Four tables in a hierarchy: **framework** → **control** → **evidence** → **submission**.

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

### What each entity means

| Entity | Real-world analogy |
|---|---|
| **Framework** | A whole compliance standard (a textbook) |
| **Control** | One specific rule inside that standard (a chapter) |
| **Evidence** | A file that proves you follow ONE rule (homework turned in) |
| **Submission** | The "received from X on date Y, status pending" stamp |

### Multi-task agent runs

When a single agent run produces N screenshots (one per sub-task), **N `Evidence` rows and N `Submission` rows** are created — all linked to the same control. Each row is written **the moment its sub-task completes**, not at the end of the run.

### Cascade behavior

When an `evidence` row is deleted:
1. Its related `submission` rows are auto-deleted (via SQLAlchemy `cascade="all, delete-orphan"`)
2. The physical file on disk is removed (via `delete_file()` in [local_storage.py](backend/app/storage/local_storage.py))

### Pre-seeded data

[`backend/app/seed.py`](backend/app/seed.py) populates the DB once with 3 frameworks and 38 controls:

| Framework | # Controls |
|---|---|
| SOC2 | 12 |
| PCI-DSS | 14 |
| HIPAA | 12 |

---

## 6. The AI Agent Pipeline

The most distinctive part of the project. The agent connects an LLM to a real Chrome browser via [`browser-use`](https://github.com/browser-use/browser-use), with several layers of orchestration built on top.

### 6.1 Five-phase evolution

The agent went through five build phases, each adding one capability:

```mermaid
flowchart LR
    A["Phase A<br/>Persistent<br/>browser session"]
    B["Phase B<br/>Two-step<br/>manual login"]
    C["Phase C<br/>Multi-task<br/>prompts"]
    D["Phase D<br/>Env context +<br/>Pause / Resume"]
    E["Phase E<br/>Live progress<br/>+ Modify next task"]

    A --> B --> C --> D --> E

    classDef done fill:#E8F8EE,stroke:#22C55E
    class A,B,C,D,E done
```

| Phase | What was added | Where it lives |
|---|---|---|
| **A** | Shared `BrowserSession` with `user_data_dir` + `keep_alive=True` → cookies persist across runs | `_get_browser()` + `BROWSER_PROFILE_DIR` in [runner.py](backend/app/agent/runner.py) |
| **B** | `open_browser_at(url)` opens browser **without LLM**; `AGENT_INSTRUCTIONS` explicitly forbids login | `open_browser_at()`, `AGENT_INSTRUCTIONS` |
| **C** | `parse_subtasks()` splits a numbered/bulleted prompt into N tasks; one screenshot per task | `parse_subtasks()`, multi-screenshot loop |
| **D** | `region_hint` injected into every task; `_pause_event` lets the user pause between tasks | `_pause_event`, `pause_runner()`, `resume_runner()` |
| **E** | Run state machine (`RUNS` dict), background coroutine, polling endpoints, inline task modification | `RUNS`, `_execute_run()`, `start_background_run()` |

### 6.2 Persistent browser session (Phase A)

Before Phase A, every agent run launched a fresh Chrome window with no cookies. After Phase A:

```mermaid
flowchart LR
    R1["Run 1<br/>(first time)"] -->|"opens new Chrome<br/>user logs in + MFA"| Cookies[(browser_profile/<br/>cookies + session)]
    R2["Run 2"] -->|"reuses same Chrome<br/>cookies already present"| Cookies
    R3["Run 3<br/>(next day)"] -->|"new Chrome reads cookies<br/>from disk → still logged in"| Cookies
    Cookies -->|"survives backend restart"| Cookies
```

Implementation:

```python
profile = BrowserProfile(
    channel="chrome",
    headless=False,
    user_data_dir=str(BROWSER_PROFILE_DIR),   # cookies persist to disk
    keep_alive=True,                          # browser doesn't close between runs
)
_shared_browser = BrowserSession(browser_profile=profile)
```

### 6.3 Two-step manual login (Phase B)

The UI splits the workflow into two explicit steps:

```mermaid
flowchart TB
    Start([User clicks Open Browser & Login])
    Start --> Open["POST /api/agent/open-portal<br/>navigate_to(url)<br/>NO LLM CALL"]
    Open --> Chrome[Chrome window opens<br/>at portal.azure.com]
    Chrome --> Login[User logs in manually<br/>+ completes MFA in browser]
    Login --> Confirm[User clicks &quot;I've logged in&quot;]
    Confirm --> Step2[Step 2 unlocks]
    Step2 --> Run([User clicks Run Agent])

    classDef manual fill:#FFF4E5,stroke:#FF7300
    classDef auto fill:#E5F3FF,stroke:#2E7DFA
    class Login,Confirm,Run manual
    class Open,Chrome,Step2 auto
```

The agent itself is also bound by a strict prompt prefix:

```
CRITICAL AUTHENTICATION RULES — READ FIRST:
- You are already logged in. A human user has already authenticated this browser session.
- DO NOT type any usernames, passwords, MFA codes, or credentials.
- DO NOT click "Sign in", "Log in", or "Continue" on any login page.
- DO NOT invent or guess credentials under any circumstance.
- If you see a login screen, sign-in prompt, or authentication challenge, STOP immediately
  and report: 'NOT_LOGGED_IN — user must authenticate first'.
```

### 6.4 Multi-task prompts (Phase C)

A single prompt with a numbered or bulleted list produces multiple screenshots:

```
1. Go to S3, find bucket "cloud-care", screenshot the objects list
2. Go to EC2, find instance "cloud-care", screenshot the details page
3. Go to DynamoDB, find table "cloud-care", screenshot the items view
```

Backend parsing (`parse_subtasks()`) recognises:
- `1.`, `1)`, `1-`, `1:` (numbered)
- `-`, `*`, `•`, `►`, `▶`, `→` (bulleted)

Each sub-task runs sequentially in the same browser. The browser keeps you logged in across all of them.

### 6.5 Environment context (Phase D)

A free-text field — *"AWS region: Asia Pacific (Mumbai) ap-south-1"* or *"Azure subscription: WSO2-Prod"* — gets prepended to every sub-task's prompt:

```
ENVIRONMENT CONTEXT (apply to all tasks):
AWS region: Asia Pacific (Mumbai) ap-south-1
Before searching for any resource, ensure you have switched to the correct
region/subscription/workspace mentioned above. ...

TASK TO PERFORM (assume you are already authenticated):
<user's actual task here>
```

Solves the "agent searched in the wrong region" problem upfront.

### 6.6 Pause / Resume / Modify next task (Phase D + E)

Between sub-tasks, the user can pause and:
- Manually interact with the browser (switch region tab, scroll, click)
- Add extra instructions for the **next** task in plain English

```mermaid
sequenceDiagram
    participant User
    participant FE as Frontend
    participant BE as Backend
    participant Run as _execute_run loop
    participant Brwsr as Chrome

    Note over Run,Brwsr: Task 1 in progress...
    User->>FE: Click Pause
    FE->>BE: POST /agent/pause
    BE->>Run: _pause_event.clear()
    Note over Run,Brwsr: Task 1 finishes naturally
    Run->>Run: await _pause_event.wait() → BLOCKS

    User->>Brwsr: Switches AWS region<br/>(direct browser interaction)
    User->>FE: Types "use the v2 table, not v1"
    FE->>BE: POST /runs/&#123;id&#125;/modify-next<br/>{additional_instruction: "..."}
    BE->>Run: RUNS[id].modifications[next_idx] = "..."
    User->>FE: Click Resume

    FE->>BE: POST /agent/resume
    BE->>Run: _pause_event.set() → UNBLOCKS
    Note over Run: Task 2 runs with modification prepended<br/>+ from new browser state
```

Pause is **task-boundary** — never mid-action. This means the browser is never left in a half-clicked state.

### 6.7 Background runs + live polling (Phase E)

Before Phase E, `POST /api/agent/run` blocked for the full duration of the run (often 2+ minutes). After Phase E:

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend (/start-run)
    participant Loop as _execute_run<br/>(asyncio task)
    participant Store as RUNS dict
    participant DB as PostgreSQL

    FE->>BE: POST /agent/start-run
    BE->>Loop: asyncio.create_task(_execute_run(run_id))
    BE->>Store: RUNS[run_id] = {status: "starting", subtasks: [...]}
    BE-->>FE: {run_id} in ~50ms

    par Background loop
        Loop->>Store: status = "running"
        Loop->>Loop: Task 1 → screenshot
        Loop->>DB: INSERT Evidence + Submission
        Loop->>Store: subtasks[0].status = "completed"<br/>+ screenshot info + evidence_id
        Loop->>Loop: Task 2 → screenshot
        Loop->>DB: INSERT Evidence + Submission
        Loop->>Store: subtasks[1].status = "completed"
        Loop->>Loop: Task 3 → screenshot
        Loop->>DB: INSERT Evidence + Submission
        Loop->>Store: status = "completed"
    and Frontend polling
        FE->>BE: GET /agent/runs/&#123;run_id&#125;
        BE->>Store: RUNS[run_id]
        BE-->>FE: current snapshot
        FE->>FE: Render timeline<br/>(1 task done, 1 running, 1 pending)
        Note over FE: Repeat every 1.5s until status=completed
    end
```

The `RUNS` dict is **the single source of truth** during a run. Frontend polls it; backend writes to it. No WebSockets, no SSE — just plain HTTP that any developer can debug with `curl`.

### 6.8 What the agent CAN do today

- Navigate to any URL
- Click buttons, links, menus
- Type into search fields and form inputs
- Scroll up / down / horizontally
- Read page text
- Switch tabs
- Wait for elements to render
- Switch region / subscription / workspace via UI selectors
- Take a fresh screenshot at the end of each sub-task
- Run multiple sub-tasks in sequence with the same authenticated session
- Pause and resume between tasks at the user's request
- Apply user-provided modifications to the next task
- Recover gracefully when a resource name doesn't match exactly (uses fuzzy search per `SEARCH & NAVIGATION STRATEGY` in the agent prompt)

### 6.9 What it cannot do yet

- Cancel a task mid-step (only between tasks)
- Run multiple **independent** tasks in parallel (one browser, one task at a time)
- Solve captchas
- Survive backend restart — in-flight runs are lost (acceptable for an internal tool)

---

## 7. Data Flow — How Each User Action Works

### 7.1 Manual evidence upload

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
    BE->>DB: INSERT INTO evidence (...)
    DB-->>BE: id=42
    BE->>DB: INSERT INTO submissions (evidence_id=42, submitted_by='manual-user', status='pending')

    BE-->>FE: 201 Created
    FE-->>User: "Evidence submitted successfully"
```

### 7.2 AI agent — full interactive multi-task flow

This is the central flow of the project. It combines all five phases.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend<br/>AgentRunner.tsx
    participant BE as Backend<br/>routes/agent.py
    participant Runner as runner.py<br/>_execute_run loop
    participant LLM as LLM provider
    participant Brwsr as Chrome<br/>(persistent session)
    participant FS as uploads/
    participant DB as PostgreSQL

    Note over User,FE: STEP 1 — Open Browser & Login
    User->>FE: Pick "AWS Console", click Open Browser & Login
    FE->>BE: POST /agent/open-portal {url: "console.aws.amazon.com"}
    BE->>Brwsr: navigate_to(url)  (NO LLM call)
    BE-->>FE: {url}
    User->>Brwsr: Logs in manually + MFA
    User->>FE: Click "I've logged in"

    Note over User,FE: STEP 1.5 — Optional environment context
    User->>FE: Type "AWS region: Asia Pacific (Mumbai)"

    Note over User,FE: STEP 2 — Run multi-task prompt
    User->>FE: Type 3-task numbered prompt
    FE->>FE: parseSubtasksClient() → live preview "Detected 3 tasks"
    User->>FE: Click Run Agent

    FE->>BE: POST /agent/start-run {prompt, region_hint, control_id}
    BE->>Runner: start_background_run() → asyncio.create_task(_execute_run)
    BE-->>FE: {run_id} (returns in ~50ms)

    loop Poll every 1.5s
        FE->>BE: GET /agent/runs/&#123;run_id&#125;
        BE-->>FE: Snapshot of RUNS[run_id]
        FE-->>User: Update timeline UI
    end

    par Background _execute_run loop
        Note over Runner: For each sub-task...
        Runner->>LLM: AGENT_INSTRUCTIONS<br/>+ context_prefix<br/>+ subtask text<br/>+ modification (if any)
        loop Up to 15 steps per task
            LLM-->>Runner: Decide next action
            Runner->>Brwsr: Playwright action
            Brwsr-->>Runner: New DOM + screenshot for vision
        end
        Runner->>Brwsr: Take final screenshot
        Brwsr-->>Runner: PNG bytes
        Runner->>FS: Save uuid.png
        Runner->>DB: INSERT Evidence + Submission (for THIS task)
        Runner->>Runner: Update RUNS[run_id].subtasks[idx]
    end

    Note over User,FE: Optional mid-run intervention
    User->>FE: Click Pause
    FE->>BE: POST /agent/pause → _pause_event.clear()
    User->>Brwsr: Manually switches region / scrolls
    User->>FE: Types "for task 3, click Capacity tab first"
    FE->>BE: POST /runs/&#123;id&#125;/modify-next
    User->>FE: Click Resume
    FE->>BE: POST /agent/resume → _pause_event.set()

    Note over FE,User: When status="completed"
    FE-->>User: Final timeline with 3 screenshots,<br/>3 Evidence IDs, 3 Submission IDs
```

### 7.3 Evidence list page

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
        BE-->>FE: JSON
    and
        FE->>BE: GET /api/controls/
        BE->>DB: SELECT * FROM controls
        BE-->>FE: JSON
    end
    FE-->>User: Render table

    User->>FE: Click Delete on a row
    FE->>BE: DELETE /api/evidence/42
    BE->>DB: Cascade DELETE evidence + linked submissions
    BE->>BE: Remove file from disk
    BE-->>FE: 204 No Content
    FE->>FE: Invalidate ['evidence'] query cache
    FE-->>User: Row disappears
```

---

## 8. Submission Status Workflow

Every submission has a `status` field:

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
| **approved** | Accepted as valid compliance evidence. |
| **rejected** | Reviewer found it insufficient. |

> The current build does not yet have a Review UI. All submissions stay at `pending`. The DB column is ready — only the UI is missing. This is the next planned feature (Phase 8 in the [Roadmap](#14-build-phases--roadmap)).

---

## 9. API Endpoints

All endpoints are prefixed with `/api`. Auto-generated docs at `http://localhost:8000/docs`.

### Health & static

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/uploads/{file_name}` | Serve a stored file |

### Frameworks & controls

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/frameworks/` | List all frameworks |
| `POST` | `/api/frameworks/` | Create a framework |
| `GET` | `/api/frameworks/{id}` | Get one |
| `GET` | `/api/controls/?framework_id={id}` | List controls (optionally filtered) |
| `POST` | `/api/controls/` | Create a control |
| `GET` | `/api/controls/{id}` | Get one |

### Evidence & submissions

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/evidence/` | List all evidence |
| `POST` | `/api/evidence/` | **Upload file → create Evidence + Submission** |
| `GET` | `/api/evidence/{id}` | Get one |
| `DELETE` | `/api/evidence/{id}` | Delete evidence (cascade) + remove file |
| `GET` | `/api/submissions/` | List all submissions (audit trail) |
| `POST` | `/api/submissions/` | Create a submission manually |
| `GET` | `/api/submissions/{id}` | Get one |

### AI agent — authentication

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/agent/open-portal` | Open persistent browser at a URL (NO LLM call) |
| `GET` | `/api/agent/browser-status` | Whether the shared browser is open + current URL |

### AI agent — run lifecycle

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/agent/start-run` | **Start a background run, returns `{run_id}`** |
| `GET` | `/api/agent/runs/{run_id}` | Poll: current state of a run |
| `POST` | `/api/agent/runs/{run_id}/modify-next` | Inject extra instructions for the next task |
| `POST` | `/api/agent/pause` | Pause after current task completes |
| `POST` | `/api/agent/resume` | Resume from pause |
| `GET` | `/api/agent/run-status` | Whether pause flag is set |
| `POST` | `/api/agent/run` | **Legacy:** synchronous run (blocks until done). Kept for back-compat. |

### Example — start a multi-task run

```json
POST /api/agent/start-run
{
  "prompt": "1. Go to S3 bucket cloud-care, screenshot objects\n2. Go to EC2 cloud-care, screenshot details\n3. Go to DynamoDB cloudcare-tf-locks, screenshot items",
  "region_hint": "AWS region: Asia Pacific (Mumbai) ap-south-1",
  "control_id": 12,
  "title": "Cloud-care quarterly evidence",
  "submitted_by": "ai-agent"
}
```

Response:
```json
{ "run_id": "a1b2c3d4e5f6", "status": "starting" }
```

### Example — poll run state

```json
GET /api/agent/runs/a1b2c3d4e5f6
```

```json
{
  "run_id": "a1b2c3d4e5f6",
  "status": "running",
  "current_index": 1,
  "subtasks": [
    {
      "index": 0,
      "text": "Go to S3 bucket cloud-care, screenshot objects",
      "status": "completed",
      "result": "Found bucket, captured 12 objects.",
      "screenshot": { "file_name": "uuid1.png", "file_url": "/uploads/uuid1.png", "subtask_index": 1 },
      "evidence_id": 14,
      "submission_id": 9
    },
    {
      "index": 1,
      "text": "Go to EC2 cloud-care, screenshot details",
      "status": "running",
      "result": null
    },
    {
      "index": 2,
      "text": "Go to DynamoDB cloudcare-tf-locks, screenshot items",
      "status": "pending"
    }
  ],
  "started_at": 1735900000.0,
  "completed_at": null
}
```

### Example — modify next task while paused

```json
POST /api/agent/runs/a1b2c3d4e5f6/modify-next
{ "additional_instruction": "Look for the v2 table, not v1. Click the Capacity tab before screenshotting." }
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

> The `Settings` class uses `extra = "ignore"` so unused provider keys can stay in `.env` without breaking startup.

### Database migration + seed

```bash
# In backend/ with venv active
alembic upgrade head
python -m app.seed
```

### Frontend setup

```bash
cd frontend
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` is required because `@mui/lab@9-beta` and `@oxygen-ui/react@2.4.6` disagree on which `@mui/material` major to depend on.

---

## 11. Running the Application

You need **three things** running. Three terminals.

```mermaid
graph LR
    A[Terminal 1<br/>docker compose up -d<br/>Postgres → 5432] --> B[Terminal 2<br/>uvicorn app.main:app<br/>Backend → 8000]
    B --> C[Terminal 3<br/>npm run dev<br/>Frontend → 5173]
    C --> D[Open browser<br/>http://localhost:5173]
```

### Daily startup commands

```bash
# Terminal 1 — Postgres (from project root)
docker compose up -d

# Terminal 2 — Backend (from backend/, venv active)
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend (from frontend/)
npm run dev
```

### Quick health check

```bash
echo "Postgres: $(docker ps --filter ancestor=postgres:16 --format '{{.Status}}' 2>/dev/null || echo DOWN)"
echo "Backend:  HTTP $(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/health)"
echo "Frontend: HTTP $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173)"
```

Expected:
```
Postgres: Up X hours
Backend:  HTTP 200
Frontend: HTTP 200
```

### First-time demo flow

1. Open http://localhost:5173/agent
2. **Step 1** → pick a portal (Azure / AWS / WSO2) → click **Open Browser & Login**
3. Log in (with MFA) in the Chrome window
4. Click **I've logged in**
5. Optionally fill **Environment hint** (e.g. *"AWS region: Mumbai ap-south-1"*)
6. **Step 2** → type a numbered list of tasks → live preview shows *"Detected N tasks"*
7. Click **Run Agent** → watch the timeline update in real time
8. Optional: click **Pause** mid-run → type extra instructions for next task → click **Resume**
9. After the run completes, screenshots appear in [`backend/uploads/`](backend/uploads/) and Evidence rows appear under `/evidence`

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
    AZ --> Agent[Agent loop<br/>max_steps=15 per task]
    AN --> Agent
    GE --> Agent
    OL --> Agent
```

Implementation lives in [`backend/app/agent/runner.py`](backend/app/agent/runner.py) → `_build_llm()`.

| Provider | `.env` value | Notes |
|---|---|---|
| Azure OpenAI | `AGENT_PROVIDER=azure` + `AZURE_OPENAI_*` | Recommended for production. |
| Anthropic | `AGENT_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` | High quality, pricier. |
| Google Gemini | `AGENT_PROVIDER=gemini` + `GEMINI_API_KEY` | Cheapest, generous free tier. |
| Ollama | `AGENT_PROVIDER=ollama` | Free, local. `ollama serve` must be running. |

---

## 13. Cost Estimates

A typical sub-task is ~10 steps (~80K input + 4K output tokens). A 3-task run is ~3× that.

| Model | Approx cost per sub-task | $40 budget buys |
|---|---|---|
| Gemini 2.5 Flash | ~$0.03 | ~1,300 sub-tasks |
| GPT-4o-mini (Azure) | ~$0.015 | ~2,500 sub-tasks |
| GPT-4.1-mini (Azure) | ~$0.04 | ~1,000 sub-tasks |
| GPT-5-mini (Azure) | ~$0.05 | ~800 sub-tasks |
| Claude Haiku 4.5 | ~$0.10 | ~400 sub-tasks |
| Claude Sonnet 4.6 | ~$0.25 | ~160 sub-tasks |
| Ollama qwen2.5:7b | $0 | unlimited (lower quality) |

> Always set a **billing budget alert** in your LLM provider's dashboard. Azure: Cost Management → Budgets → set monthly cap + email alert.

---

## 14. Build Phases & Roadmap

```mermaid
graph LR
    P1[Phase 1<br/>FastAPI<br/>+ DB + Docker]
    P2[Phase 2<br/>Models +<br/>Alembic]
    P3[Phase 3<br/>REST routes]
    P4[Phase 4<br/>Local storage]
    P5[Phase 5<br/>React + MUI<br/>+ Oxygen UI]
    P6[Phase 6<br/>AI agent v1<br/>browser-use]
    P7[Phase 7<br/>Agent → DB<br/>auto-link]
    PA[Phase A<br/>Persistent<br/>session]
    PB[Phase B<br/>Two-step<br/>manual login]
    PC[Phase C<br/>Multi-task<br/>prompts]
    PD[Phase D<br/>Env ctx +<br/>Pause / Resume]
    PE[Phase E<br/>Live progress<br/>+ Modify]
    P8[Phase 8<br/>Review UI]
    P9[Phase 9<br/>Azure Blob]
    P10[Phase 10<br/>Auth]

    P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7
    P7 --> PA --> PB --> PC --> PD --> PE
    PE --> P8 --> P9 --> P10

    classDef done fill:#E8F8EE,stroke:#22C55E
    classDef todo fill:#F1F1F1,stroke:#999
    class P1,P2,P3,P4,P5,P6,P7,PA,PB,PC,PD,PE done
    class P8,P9,P10 todo
```

### Completed

| Phase | What |
|---|---|
| 1 | FastAPI skeleton, DB connection, Docker compose |
| 2 | SQLAlchemy models + Alembic migrations |
| 3 | REST API endpoints for all resources |
| 4 | Local file storage with upload/delete |
| 5 | React frontend with MUI + Oxygen UI |
| 6 | AI agent v1 (browser-use + multi-provider LLM) |
| 7 | Agent output auto-creates Evidence + Submission rows |
| **A** | **Persistent browser session — cookies survive restarts** |
| **B** | **Two-step manual login flow + anti-login agent instructions** |
| **C** | **Multi-task prompts (one screenshot per sub-task)** |
| **D** | **Environment context field + pause/resume between tasks** |
| **E** | **Background runs + live polling + inline modify-next-task** |

### Planned

| Phase | Description |
|---|---|
| 8 | **Review workflow** — UI for reviewers to change submission status. |
| 9 | **Azure Blob storage** — swap [`local_storage.py`](backend/app/storage/local_storage.py) for an Azure Blob implementation. Same function signatures. |
| 10 | **Authentication** — Azure AD / Entra ID login. Replace hardcoded `submitted_by` strings. |
| Optional | True parallel sub-task execution (multiple tabs); Server-Sent Events instead of polling; pytest suite + CI. |

---

## 15. Security Properties

The agent system is designed so that credentials never leave the user's hands.

| Property | How it's achieved |
|---|---|
| **No credentials in code** | Backend has no field to receive a password. `.env` holds only `DATABASE_URL` and LLM API keys. |
| **No credentials in logs** | Only URLs the browser navigated to are logged. Form inputs are never recorded. |
| **MFA-compatible** | User performs login + MFA in their normal browser flow before the agent starts. |
| **Identity-bound evidence** | Cookies in `browser_profile/` belong to whichever human authenticated. The audit trail (`submitted_by` field) records `"ai-agent"`, but the *underlying portal action* is tied to the human user's account. |
| **AI can't bypass login** | `AGENT_INSTRUCTIONS` explicitly forbids typing credentials. If the agent sees a login screen, it reports `NOT_LOGGED_IN` and stops. |
| **Pause is task-boundary** | The agent can't be interrupted mid-click — only between sub-tasks. No half-finished browser state. |
| **Browser profile is gitignored** | Cookies never reach version control. |

### Files that should be in `.gitignore`

```
backend/uploads/
backend/browser_profile/
backend/.env
backend/venv/
frontend/node_modules/
frontend/dist/
```

### Operations checklist

- Restrict filesystem permissions on `backend/browser_profile/` to the backend service user (`chmod 700`).
- Set a budget alert in your LLM provider's dashboard.
- Rotate `AZURE_OPENAI_API_KEY` periodically.
- When session expires (Azure ~24h, AWS ~12h), the next agent run will hit a login screen and stop with `NOT_LOGGED_IN`. The user re-runs Step 1 to refresh.

---

## 16. Troubleshooting

### Backend won't connect to Postgres

```
sqlalchemy.exc.OperationalError: connection to server failed
```

PostgreSQL container is down:
```bash
docker compose up -d
```

### `pydantic_core._pydantic_core.ValidationError: Extra inputs are not permitted`

`backend/.env` contains keys not declared in the `Settings` class. Fix already in place — `app/config.py` has `extra = "ignore"`. If you regress this, add it back to the inner `Config` class.

### `ModuleNotFoundError: alembic`

```bash
pip install alembic
```

### Frontend shows blank page

Open DevTools (F12) → Console. Common cause: **MUI v5 icons are incompatible with React 19**. Use `@oxygen-ui/react-icons` instead. All existing code uses Oxygen icons; follow the same pattern when adding new icons.

### `npm install` fails with peer-dep conflict

```bash
npm install --legacy-peer-deps
```

(See [10. Setup & Installation](#10-setup--installation) for why.)

### CORS errors in the browser

```
Cross-Origin Request Blocked
```

Usually means **the backend isn't running**. Start it.

### Port 8000 already in use

```bash
kill $(lsof -t -i:8000)
```

### Agent reports `NOT_LOGGED_IN`

Session expired (Azure ~24h, AWS ~12h). Re-do **Step 1** on the Agent page.

### Agent took screenshot of wrong page / wrong region

Use the **Environment hint** field in Step 1: *"AWS region: Asia Pacific (Mumbai) ap-south-1"*. It's prepended to every sub-task so the agent switches region before searching.

### Live timeline says "running" forever

Backend most likely crashed mid-run. Tail the backend log:
```bash
tail -100 /tmp/backend.log
```
Restart the backend; the run is lost (`RUNS` is in-memory). Completed sub-tasks before the crash are already saved to the DB.

### Sub-task parsed wrong (3 tasks → only 2 detected)

Check the live preview chip on the Agent page. The frontend parser mirrors the backend exactly. If it shows the wrong count, the prompt formatting is the issue — make sure each task starts on a new line with `1.`, `2.`, `-`, or `*`.

### Browser profile is too big / want a clean session

Stop the backend, delete `backend/browser_profile/`, restart. The next agent run will open a fresh browser; user must log in again.

### Agent screenshot saved but not in Evidence list

You ran the agent without picking a framework + control. The screenshot stays as a loose file in `uploads/`; no DB rows are created. Pick a control on the Agent page next time.

### DB rows reference files that don't exist (or vice versa)

Cascade-delete orphans:
```bash
docker exec -i $(docker ps -q --filter "ancestor=postgres:16") psql -U complianceuser -d compliance_db -c \
  "DELETE FROM evidence WHERE file_name NOT IN (SELECT 'placeholder');"
```

(Replace the subquery with the actual file_names to keep.)

---

## License & Contributing

Internal WSO2 project. For questions or issues, contact the maintainers.

See [PROJECT_EXPLAINED.md](PROJECT_EXPLAINED.md) for a beginner-friendly companion to this technical README.
