import { useState } from "react";
import { agentApi } from "../api/client";

export default function AgentRunner() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setStatus("running");
    setResult(null);
    setScreenshotUrl(null);
    setError(null);

    try {
      const data = await agentApi.run(prompt);
      setResult(data.result);
      setScreenshotUrl(data.screenshot_url);
      setStatus("done");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Agent failed. Check backend logs.");
      setStatus("error");
    }
  };

  return (
    <div className="page">
      <h1>AI Agent Runner</h1>
      <p className="subtitle">
        Describe what to navigate and capture. The agent will control a browser automatically.
      </p>

      <form className="form" onSubmit={handleRun}>
        <div className="form-group">
          <label>Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder='e.g. "Go to Azure Portal, navigate to Key Vault X, take a screenshot of the access policy"'
            required
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={status === "running"}
        >
          {status === "running" ? "Agent running..." : "Run Agent"}
        </button>
      </form>

      {status === "running" && (
        <div className="agent-log">
          <div className="log-box">
            <div className="log-line">Agent is navigating the browser. This may take 30–120 seconds...</div>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="alert" style={{ background: "#fee2e2", color: "#991b1b", marginTop: "1.5rem" }}>
          {error}
        </div>
      )}

      {status === "done" && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Result</h2>
          <div className="agent-log">
            <div className="log-box">
              <div className="log-line">{result}</div>
            </div>
          </div>

          {screenshotUrl && (
            <div style={{ marginTop: "1.5rem" }}>
              <h2>Screenshot</h2>
              <img
                src={`http://localhost:8000${screenshotUrl}`}
                alt="Agent screenshot"
                style={{ width: "100%", borderRadius: "8px", border: "1px solid #e2e8f0", marginTop: "0.5rem" }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
