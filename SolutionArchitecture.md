# Solution Architecture: Compliance Evidence Submission Portal

## 1. Project Overview
WSO2 requires a streamlined, automated way to collect evidence for compliance frameworks (SOC2, PCI-DSS, HIPAA). This project replaces manual "screenshot-and-upload" workflows with an AI-driven agent capable of navigating cloud portals and managing artifacts in a centralized, versioned store.

**Duration:** 2 Months  
**Team Size:** 1 Person (Solo)

---

## 2. High-Level System Architecture

The system follows a **Three-Tier Architecture** with an added **AI Execution Layer**.

1.  **Frontend (Presentation Layer):** A React-based dashboard where users manage controls and prompt the agent.
2.  **Backend (Application & Logic Layer):** A FastAPI (Python) server that manages the database, business logic, and communication with the AI.
3.  **AI Agent (Automation Layer):** A specialized Python layer using `browser-use` and `Playwright` to interact with the web.
4.  **Storage (Data Layer):** * **Relational Database:** Stores metadata, control mappings, and logs.
    * **Azure Blob Storage:** Stores the physical evidence files (screenshots/PDFs).

---

## 3. Data Flow & Component Interaction

### The "Command-to-Cloud" Workflow:
1.  **Input:** User enters a natural language command in the React UI.
2.  **Mapping:** The Backend identifies which Compliance Control (e.g., SOC2 CC6.1) the request belongs to.
3.  **Agent Trigger:** The Backend invokes the AI Agent with a high-level task.
4.  **Navigation:** The Agent uses an LLM (Claude 3.5) to decide which buttons to click in the Azure/AWS portal via Playwright.
5.  **Capture:** The Agent takes a screenshot and returns the raw bytes to the Backend.
6.  **Persistence:** * Backend uploads the image to **Azure Blob Storage**.
    * Backend saves a reference URL and timestamp in the **Database**.
7.  **Feedback:** The UI updates to show the new evidence in the history table.

---

## 4. Database Schema & Storage Strategy

### A. Relational Database (SQL)
Stores the "Who, What, When, and Where."

| Table | Column | Type | Description |
| :--- | :--- | :--- | :--- |
| **Frameworks** | `id`, `name` | String | e.g., 'HIPAA', 'SOC2' |
| **Controls** | `id`, `code`, `description` | String | e.g., 'CC6.1', 'Access Policy' |
| **EvidenceItems** | `id`, `control_id`, `blob_url` | String | Link to the file in Azure |
| **AuditTrail** | `id`, `action`, `user`, `timestamp` | String/Date | Log of all system activities |

### B. Azure Blob Storage (Object Storage)
Stores the "Evidence Artifacts."
* **Container Name:** `compliance-evidence`
* **Naming Convention:** `/{framework}/{control_id}/{year}/{month}/{evidence_id}.png`
* **Version Control:** Uses Blob Versioning to ensure older screenshots are never overwritten.

---

## 5. Technology Stack

* **Frontend:** React.js, Tailwind CSS (for UI), Axios (for API calls).
* **Backend:** Python 3.10+, FastAPI, SQLAlchemy (Database ORM).
* **AI Agent:** * **LLM:** Anthropic Claude 3.5 Sonnet (Reasoning engine).
    * **Automation:** `browser-use` library.
    * **Browser Driver:** Playwright (Chromium).
* **Cloud Infrastructure:** Azure Blob Storage, Azure Key Vault (for storing portal passwords).

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
* Setup FastAPI environment and Database models.
* Configure Azure Blob Storage SDK.
* **Goal:** Successfully upload a file from the UI to Azure Storage manually.

### Phase 2: Agent Intelligence (Weeks 3-4)
* Integrate `browser-use` with Claude API.
* Develop the "Authentication Script" (How the agent logs into Azure).
* **Goal:** Run a script that searches for "Storage Accounts" in Azure autonomously.

### Phase 3: The Control Mapping (Weeks 5-6)
* Populate the database with SOC2, HIPAA, and PCI-DSS control lists.
* Build the mapping logic: Prompt -> Control ID -> Azure Path.
* **Goal:** Trigger an agent run specifically for a "Control ID" from the UI.

### Phase 4: Audit & UI Polish (Weeks 7-8)
* Build the Evidence Gallery (viewing history and comparing screenshots).
* Implement security hardening (Environment variables, secret masking).
* Final testing and bug fixing.

---

## 7. Security Considerations
* **Credential Masking:** The AI Agent should never "leak" passwords in logs. Use Azure Key Vault.
* **Least Privilege:** The Azure account used by the Agent should have "Reader" access only—never "Contributor"—to prevent the AI from accidentally deleting resources.
* **Data Encryption:** All evidence in Blob Storage must be encrypted at rest (Azure default).

---
*Created for: WSO2 Compliance Evidence Submission Project*
