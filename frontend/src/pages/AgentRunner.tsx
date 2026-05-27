import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { agentApi } from "../api/client";
import "../index.css";

export default function AgentRunner() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async (e: React.FormEvent) => {
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
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        AI Agent Runner
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Describe what to navigate and capture. The agent will control a real browser automatically.
      </Typography>

      <Paper variant="outlined" sx={{ p: 3, maxWidth: 700 }}>
        <Box component="form" onSubmit={handleRun}>
          <Stack spacing={2.5}>
            <TextField
              label="Prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='e.g. "Go to Azure Portal, navigate to Key Vault X, take a screenshot of the access policy"'
              multiline
              rows={4}
              required
              fullWidth
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={status === "running"}
              startIcon={status === "running" ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {status === "running" ? "Agent running..." : "Run Agent"}
            </Button>
          </Stack>
        </Box>
      </Paper>

      {status === "running" && (
        <Paper variant="outlined" sx={{ mt: 3, maxWidth: 700 }}>
          <Box className="log-box">
            <div className="log-line">Agent is navigating the browser. This may take 30–120 seconds...</div>
          </Box>
        </Paper>
      )}

      {status === "error" && (
        <Alert severity="error" sx={{ mt: 3, maxWidth: 700 }}>
          {error}
        </Alert>
      )}

      {status === "done" && (
        <Box sx={{ mt: 3, maxWidth: 700 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Result
          </Typography>
          <Paper variant="outlined">
            <Box className="log-box">
              <div className="log-line">{result}</div>
            </Box>
          </Paper>

          {screenshotUrl && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Screenshot
              </Typography>
              <Box
                component="img"
                src={`http://localhost:8000${screenshotUrl}`}
                alt="Agent screenshot"
                sx={{ width: "100%", borderRadius: 1, border: "1px solid", borderColor: "divider" }}
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
