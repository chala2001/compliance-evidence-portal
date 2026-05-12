# Stage 07 — React TypeScript Frontend (Phase 5)

In this stage you build the complete React frontend: scaffolding, routing, API client,
five pages, navigation, and global styles.

At the end of this stage `http://localhost:5173` shows the full app with a working dashboard,
evidence list, submission form, history, and agent placeholder.

---

## 1. Key Technologies Used

### React 19
A JavaScript library for building UIs as a tree of components.
Each component is a function that returns JSX (HTML-like syntax in JavaScript).
React re-renders components automatically when their data changes.

### TypeScript
A typed superset of JavaScript. You declare variable types and TypeScript catches bugs before
the browser runs the code. Example:
```typescript
const count: number = "hello";  // Error at compile time, not runtime
```

### Vite
The build tool. In development it starts a dev server in milliseconds with instant hot reload.
`npm run dev` → Vite starts → changes to files instantly update the browser.

### TanStack React Query (v5)
Manages server state — data that lives on the server and is fetched via API.
- `useQuery` fetches data and caches it. If two components use `useQuery({queryKey: ["evidence"]})`,
  only one HTTP request is made.
- `useMutation` handles POST/DELETE requests with automatic cache invalidation.
- `invalidateQueries` marks a query as stale, triggering a refetch on the next render.

### Axios
HTTP client library. Simplifies `fetch` with:
- Base URL configuration (set `http://localhost:8000/api` once, use relative paths everywhere)
- Automatic JSON parsing
- Better error handling

### React Router DOM (v7)
Client-side routing. When you click a `<NavLink>`, the URL changes and a different component
renders — without a full page reload.

---

## 2. Scaffold the Vite Project

Run this from the **project root** (NOT from inside `backend/`):

```bash
npm create vite@latest frontend -- --template react-ts
```

**What this command does:**
- `npm create vite@latest` — downloads and runs the Vite scaffolding tool
- `frontend` — create the project in a folder called `frontend`
- `-- --template react-ts` — use the React + TypeScript template

This creates a complete working Vite app in `frontend/`. You can run it immediately with
`cd frontend && npm install && npm run dev`.

Then install the additional packages:

```bash
cd frontend
npm install
npm install react-router-dom axios @tanstack/react-query
```

---

## 3. Understanding `package.json`

After installing, `frontend/package.json` looks like:

```json
{
  "name": "frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.100.10",
    "axios": "^1.16.0",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "react-router-dom": "^7.15.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.0.1",
    "typescript": "~6.0.2",
    "vite": "^8.0.12"
    ...
  }
}
```

- `"type": "module"` — this project uses ES modules (import/export), not CommonJS (require)
- `"dependencies"` — packages needed at runtime (shipped to the browser)
- `"devDependencies"` — packages only needed during development/build (TypeScript, Vite, etc.)
- `npm run dev` runs `vite` — starts the development server
- `npm run build` runs `tsc -b && vite build` — type-checks then bundles for production

---

## 4. Understanding `vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

- `defineConfig` — provides TypeScript autocompletion for config options
- `react()` plugin — enables React's JSX transform and fast refresh (hot reload without losing state)

---

## 5. Create `src/main.tsx`

This is the application entry point — the first file that runs.

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

**Line-by-line explanation:**

```tsx
import { StrictMode } from "react";
```
`StrictMode` is a development helper that runs your component functions twice to detect side
effects and deprecated API usage. It has no effect in production builds.

```tsx
import { createRoot } from "react-dom/client";
```
`createRoot` is the React 18+ API for mounting the React tree into a DOM node.

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
```
- `QueryClient` — the cache/state manager for React Query
- `QueryClientProvider` — makes the QueryClient available to all descendant components via React Context

```tsx
import "./index.css";
```
Imports the global CSS. Vite includes this CSS in the page automatically.

```tsx
const queryClient = new QueryClient();
```
Creates a single QueryClient instance. All queries go through this one cache.
React Query automatically deduplicates requests (two components fetching the same key = 1 request).

```tsx
createRoot(document.getElementById("root")!).render(
```
- `document.getElementById("root")` — finds the `<div id="root">` in `index.html`
- The `!` (non-null assertion) tells TypeScript "I know this won't be null"
- `.render(...)` — mounts the React component tree

```tsx
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
```
The component tree hierarchy:
1. `StrictMode` — development checks
2. `QueryClientProvider` — makes `queryClient` available via `useQueryClient()` and hooks
3. `App` — your application code

---

## 6. Create `src/App.tsx`

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

**Line-by-line explanation:**

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
```
- `BrowserRouter` — wraps the app and enables URL-based routing using the browser's History API
- `Routes` — container for route definitions
- `Route` — maps a URL path to a component

```tsx
  return (
    <BrowserRouter>
      <Navbar />
      <main className="main-content">
        <Routes>
```
`BrowserRouter` must wrap everything that uses routing. `Navbar` is outside `<Routes>` so it
renders on every page. The `<Routes>` block renders only one matching `<Route>` at a time.

```tsx
          <Route path="/" element={<Dashboard />} />
          <Route path="/evidence" element={<EvidenceList />} />
```
When the URL is `/evidence`, React renders `<EvidenceList />` inside `main.main-content`.
`<Navbar />` stays visible.

---

## 7. Create `src/api/client.ts`

```bash
mkdir -p src/api
```

```typescript
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

**Line-by-line explanation:**

```typescript
const api = axios.create({
  baseURL: "http://localhost:8000/api",
});
```
Creates an Axios instance with a base URL. All requests made via `api` automatically prepend
this URL. `api.get("/frameworks/")` sends to `http://localhost:8000/api/frameworks/`.

```typescript
export const frameworksApi = {
  list: () => api.get("/frameworks/").then((r) => r.data),
};
```
An object grouping related API calls. Each method returns a Promise.
`.then((r) => r.data)` extracts just the response body (Axios wraps responses in `r.data`).

This centralization means if the API URL changes, you update one file.
Components import `frameworksApi.list()` and never hardcode URLs.

```typescript
export const controlsApi = {
  list: (frameworkId?: number) =>
    api
      .get("/controls/", { params: frameworkId ? { framework_id: frameworkId } : {} })
      .then((r) => r.data),
};
```
- `frameworkId?: number` — optional parameter (the `?` means it can be `undefined`)
- `params: { framework_id: frameworkId }` — Axios serializes this as query string: `?framework_id=1`
- If `frameworkId` is undefined, pass empty params (no filter — return all controls)

```typescript
  create: (formData: FormData) =>
    api.post("/evidence/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data),
```
`FormData` is the browser's built-in object for multipart form data.
Setting `Content-Type: multipart/form-data` tells the server to parse this as a form upload.
The browser automatically sets the correct `boundary` parameter in the header.

---

## 8. Create `src/components/Navbar.tsx`

```bash
mkdir -p src/components
```

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

**Key concept — `NavLink` vs `Link`:**

`NavLink` automatically adds an `active` CSS class to the link when its `to` path matches the
current URL. The `index.css` styles `.navbar-links a.active` with a blue underline.

`end` on the Dashboard link means "only match if the URL is exactly `/`". Without `end`,
the Dashboard link would also be active at `/evidence` because `/evidence` starts with `/`.

---

## 9. Create `src/pages/Dashboard.tsx`

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

**Line-by-line explanation:**

```tsx
const { data: evidence = [] } = useQuery({ queryKey: ["evidence"], queryFn: evidenceApi.list });
```
- `useQuery` — React Query hook for fetching data
- `queryKey: ["evidence"]` — unique identifier for this query's cache entry.
  Any component using `queryKey: ["evidence"]` shares the same cached data.
- `queryFn: evidenceApi.list` — function to call to fetch the data
- `data: evidence = []` — destructures `data` from the result, renamed to `evidence`,
  defaulting to `[]` while loading (to avoid `.length` errors on undefined)

```tsx
{submissions.filter((s: any) => s.status === "pending").length}
```
Counts submissions where `status === "pending"`. Uses JavaScript's `Array.filter()`.
`(s: any)` — TypeScript type annotation, `any` bypasses type checking (acceptable here
since we don't have TypeScript interfaces for API responses yet).

```tsx
{submissions.slice(0, 5).map((s: any) => (
  <tr key={s.id}>
```
- `slice(0, 5)` — take only the first 5 submissions
- `.map(...)` — transform each submission into a `<tr>` element
- `key={s.id}` — React requires a unique key on each list element for efficient re-renders

```tsx
<span className={`badge badge-${s.status}`}>{s.status}</span>
```
Template literal dynamically builds a CSS class name:
- `status = "pending"` → `className = "badge badge-pending"`
- `status = "approved"` → `className = "badge badge-approved"`

The `index.css` defines `.badge-pending`, `.badge-approved`, `.badge-rejected` with different colors.

---

## 10. Create `src/pages/EvidenceList.tsx`

Key concepts in this page:

```tsx
const queryClient = useQueryClient();
```
Gets the QueryClient instance from React Query context. Used to call `invalidateQueries`.

```tsx
const deleteMutation = useMutation({
  mutationFn: evidenceApi.delete,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["evidence"] }),
});
```
- `useMutation` — React Query hook for POST/DELETE operations
- `mutationFn` — the function to call when the mutation is triggered
- `onSuccess` — runs after a successful deletion
- `invalidateQueries({ queryKey: ["evidence"] })` — marks the evidence list cache as stale.
  Any component showing evidence data automatically refetches.

```tsx
<button onClick={() => deleteMutation.mutate(e.id)}>
  Delete
</button>
```
`mutate(e.id)` triggers the mutation. React Query calls `evidenceApi.delete(e.id)`.

---

## 11. Create `src/pages/SubmitEvidence.tsx`

Key concepts:

```tsx
const { data: controls = [] } = useQuery({
  queryKey: ["controls", frameworkId],
  queryFn: () => controlsApi.list(frameworkId),
  enabled: !!frameworkId,
});
```
- `queryKey: ["controls", frameworkId]` — the key includes `frameworkId`. When `frameworkId`
  changes, React Query treats it as a different query and fetches fresh data.
- `enabled: !!frameworkId` — the query only runs if `frameworkId` is truthy (not undefined/null).
  Before a framework is selected, no request is made.

```tsx
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
```
- `e.preventDefault()` — prevents the browser's default form submission (which would reload the page)
- `new FormData()` — browser's built-in multipart form data builder
- `formData.append("control_id", String(controlId))` — form data values must be strings
- `formData.append("file", file)` — appends the File object from the `<input type="file">`

---

## 12. Create `src/pages/SubmissionHistory.tsx` and `src/pages/AgentRunner.tsx`

`SubmissionHistory` is a simple read-only page using `useQuery` to list submissions in a table.

`AgentRunner` is a **placeholder** — it shows a text area for the prompt and simulates a
response with `setTimeout`. The real API will be wired in Stage 08 (Phase 6).

---

## 13. Replace `src/index.css`

The default Vite CSS resets and styles are replaced with the project's custom design system.

Key CSS concepts used:

```css
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}
```
CSS Grid layout: 4 equal-width columns. `1fr` = 1 fractional unit of available space.
On a 1100px container: each column is approximately 260px wide.

```css
.navbar-links a.active {
  color: #fff;
  border-bottom-color: #4f8ef7;
}
```
Styles the active nav link. React Router's `<NavLink>` automatically adds the `active` class
to the link matching the current URL.

```css
.badge-pending  { background: #fef3c7; color: #92400e; }
.badge-approved { background: #d1fae5; color: #065f46; }
.badge-rejected { background: #fee2e2; color: #991b1b; }
```
Status badges use semantic colors: yellow for pending, green for approved, red for rejected.
The class name is built dynamically: `badge badge-${status}`.

---

## 14. Run the Frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`.

With the backend also running, try:
1. Create a framework via Swagger: `POST /api/frameworks/`
2. Create a control: `POST /api/controls/`
3. Go to `http://localhost:5173/submit` — select the framework and control, upload a file
4. Go to `http://localhost:5173` — Dashboard should show counts

---

## 15. TypeScript Configuration

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    {"path": "./tsconfig.app.json"},
    {"path": "./tsconfig.node.json"}
  ]
}
```

Two separate configs:
- `tsconfig.app.json` — TypeScript settings for the browser code (React components)
- `tsconfig.node.json` — TypeScript settings for Vite config files (Node.js environment)

`tsconfig.app.json` key settings:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "strict": true
  }
}
```
- `"jsx": "react-jsx"` — enables JSX without importing React in every file (React 17+)
- `"strict": true` — enables all strict type checking rules

---

## 16. What the Vite Dev Server Does

`npm run dev` starts Vite's development server:
- Serves `index.html` at `http://localhost:5173`
- When `index.html` loads, it loads `src/main.tsx`
- Vite transforms TypeScript and JSX to JavaScript on-the-fly (no compile step needed)
- Hot Module Replacement (HMR): when you save a file, only that module is replaced in the browser
  — the page doesn't fully reload and state is preserved

The difference from production:
- Dev: individual module files, no minification, fast dev experience
- Prod: `npm run build` bundles everything into optimized files in `frontend/dist/`

---

## 17. Next Stage

The React frontend is complete (through Phase 5). The AgentRunner page shows a placeholder.

Move on to [stage-08-ai-agent.md](stage-08-ai-agent.md) to implement Phase 6 — the AI
browser agent that navigates portals autonomously.
