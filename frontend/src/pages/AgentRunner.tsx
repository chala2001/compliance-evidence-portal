import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import { BoltIcon, ArrowRightIcon, CircleCheckFilledIcon } from "@oxygen-ui/react-icons";
import { agentApi, frameworksApi, controlsApi } from "../api/client";
import "../index.css";

export default function AgentRunner() {
  const queryClient = useQueryClient();
  const [frameworkId, setFrameworkId] = useState<number | "">("");
  const [controlId, setControlId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState<number | null>(null);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: frameworks = [] } = useQuery({
    queryKey: ["frameworks"],
    queryFn: frameworksApi.list,
  });
  const { data: controls = [] } = useQuery({
    queryKey: ["controls", frameworkId || undefined],
    queryFn: () => controlsApi.list(frameworkId || undefined),
    enabled: !!frameworkId,
  });

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setStatus("running");
    setResult(null);
    setScreenshotUrl(null);
    setEvidenceId(null);
    setSubmissionId(null);
    setError(null);

    try {
      const data = await agentApi.run({
        prompt,
        control_id: controlId ? Number(controlId) : undefined,
        title: title || undefined,
      });
      setResult(data.result);
      setScreenshotUrl(data.screenshot_url);
      setEvidenceId(data.evidence_id);
      setSubmissionId(data.submission_id);
      setStatus("done");

      if (data.evidence_id) {
        queryClient.invalidateQueries({ queryKey: ["evidence"] });
        queryClient.invalidateQueries({ queryKey: ["submissions"] });
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Agent failed. Check backend logs.");
      setStatus("error");
    }
  };

  return (
    <Box sx={{ maxWidth: 760, mx: "auto" }}>
      <Box sx={{ textAlign: "center", mb: 4 }}>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56,
            height: 56,
            borderRadius: "50%",
            backgroundColor: "rgba(255,115,0,0.10)",
            color: "primary.main",
            mb: 1.5,
          }}
        >
          <BoltIcon size={28} />
        </Box>
        <Typography variant="h4" gutterBottom>
          AI Agent Runner
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560, mx: "auto" }}>
          Describe what to navigate and capture. The agent will control a real browser automatically.
          Optionally link the screenshot to a compliance control to auto-create an evidence record.
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 } }}>
        <Box component="form" onSubmit={handleRun}>
          <Stack spacing={2.5}>
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.72rem" }}>
                Link to compliance control
              </Typography>
              <Chip label="Optional" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
            </Stack>

            <FormControl fullWidth>
              <InputLabel>Framework</InputLabel>
              <Select
                label="Framework"
                value={frameworkId}
                onChange={(e) => {
                  setFrameworkId(e.target.value as number | "");
                  setControlId("");
                }}
              >
                <MenuItem value="">
                  <em>— Just run, don't save as evidence —</em>
                </MenuItem>
                {frameworks.map((f: any) => (
                  <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {frameworkId !== "" && (
              <FormControl fullWidth>
                <InputLabel>Control</InputLabel>
                <Select
                  label="Control"
                  value={controlId}
                  onChange={(e) => setControlId(e.target.value as number | "")}
                >
                  <MenuItem value="">
                    <em>— Select a control —</em>
                  </MenuItem>
                  {controls.map((c: any) => (
                    <MenuItem key={c.id} value={c.id}>{c.control_ref} — {c.title}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {controlId !== "" && (
              <TextField
                label="Evidence Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Defaults to start of prompt"
                fullWidth
              />
            )}

            <Divider sx={{ my: 1 }} />

            <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.72rem" }}>
              Task
            </Typography>

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
              startIcon={status === "running" ? <CircularProgress size={16} color="inherit" /> : <ArrowRightIcon size={18} />}
              sx={{ py: 1.25 }}
            >
              {status === "running" ? "Agent running..." : "Run Agent"}
            </Button>
          </Stack>
        </Box>
      </Paper>

      {status === "running" && (
        <Paper variant="outlined" sx={{ mt: 3, overflow: "hidden" }}>
          <Box className="log-box">
            <div className="log-line">Agent is navigating the browser. This may take 30–120 seconds...</div>
          </Box>
        </Paper>
      )}

      {status === "error" && (
        <Alert severity="error" sx={{ mt: 3 }}>
          {error}
        </Alert>
      )}

      {status === "done" && (
        <Box sx={{ mt: 3 }}>
          {evidenceId && submissionId && (
            <Alert
              severity="success"
              icon={<CircleCheckFilledIcon size={18} />}
              sx={{ mb: 3 }}
            >
              Saved as <strong>Evidence #{evidenceId}</strong> and <strong>Submission #{submissionId}</strong> (status: pending). Check the Evidence and History pages.
            </Alert>
          )}

          <Typography variant="h6" fontWeight={600} gutterBottom>
            Result
          </Typography>
          <Paper variant="outlined" sx={{ overflow: "hidden" }}>
            <Box className="log-box">
              <div className="log-line">{result}</div>
            </Box>
          </Paper>

          {screenshotUrl && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Screenshot
              </Typography>
              <Paper variant="outlined" sx={{ overflow: "hidden", p: 1 }}>
                <Box
                  component="img"
                  src={`http://localhost:8000${screenshotUrl}`}
                  alt="Agent screenshot"
                  sx={{ width: "100%", display: "block", borderRadius: 1 }}
                />
              </Paper>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
