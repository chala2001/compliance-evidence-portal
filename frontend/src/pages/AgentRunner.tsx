import { useState } from "react";

export default function AgentRunner() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [log, setLog] = useState<string[]>([]);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setStatus("running");
    setLog(["Agent started...", `Prompt: ${prompt}`]);

    // Placeholder — agent API will be wired in Phase 6
    setTimeout(() => {
      setLog((prev) => [...prev, "Agent execution not yet implemented.", "This will be wired up in Phase 6."]);
      setStatus("done");
    }, 1500);
  };

  return (
    <div className="page">
      <h1>AI Agent Runner</h1>
      <p className="subtitle">
        Describe what evidence to collect and the agent will navigate the portal automatically.
      </p>

      <form className="form" onSubmit={handleRun}>
        <div className="form-group">
          <label>Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder='e.g. "Go to Azure Portal, navigate to Key Vault X, take a screenshot of the access policy, and upload it to control CC6.1"'
            required
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={status === "running"}
        >
          {status === "running" ? "Running..." : "Run Agent"}
        </button>
      </form>

      {log.length > 0 && (
        <div className="agent-log">
          <h3>Agent Log</h3>
          <div className="log-box">
            {log.map((line, i) => (
              <div key={i} className="log-line">{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
