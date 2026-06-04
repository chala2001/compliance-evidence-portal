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

const PORTAL_PRESETS: { label: string; url: string }[] = [
  { label: "Azure Portal", url: "https://portal.azure.com" },
  { label: "AWS Console", url: "https://console.aws.amazon.com" },
  { label: "WSO2 Identity Server (Cloud)", url: "https://console.asgardeo.io" },
  { label: "Custom URL", url: "" },
];

const SUBTASK_RE = /^\s*(?:\d+[.)\-:]?|[-*•►▶→])\s+(.+)$/;

function parseSubtasksClient(prompt: string): string[] {
  const lines = prompt.trim().split("\n");
  const tasks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const m = line.match(SUBTASK_RE);
    if (m) {
      if (current.length) tasks.push(current);
      current = [m[1].trim()];
    } else if (current.length && line.trim()) {
      current.push(line.trim());
    }
  }
  if (current.length) tasks.push(current);
  const joined = tasks.map((t) => t.join("\n").trim()).filter(Boolean);
  return joined.length ? joined : prompt.trim() ? [prompt.trim()] : [];
}

export default function AgentRunner() {
  const queryClient = useQueryClient();
  const [frameworkId, setFrameworkId] = useState<number | "">("");
  const [controlId, setControlId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState<Array<{ subtask: string; subtask_index: number; file_url: string; file_name: string }>>([]);
  const [evidenceIds, setEvidenceIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [portalPreset, setPortalPreset] = useState<string>("Azure Portal");
  const [portalUrl, setPortalUrl] = useState<string>("https://portal.azure.com");
  const [openingPortal, setOpeningPortal] = useState(false);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [loginDone, setLoginDone] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [regionHint, setRegionHint] = useState<string>("");
  const [isPaused, setIsPaused] = useState(false);
  const parsedTasks = parseSubtasksClient(prompt);

  const handlePresetChange = (value: string) => {
    setPortalPreset(value);
    const preset = PORTAL_PRESETS.find((p) => p.label === value);
    if (preset && preset.url) setPortalUrl(preset.url);
    else setPortalUrl("");
  };

  const handleOpenPortal = async () => {
    if (!portalUrl.trim()) {
      setPortalError("Please enter a URL");
      return;
    }
    setOpeningPortal(true);
    setPortalError(null);
    setLoginDone(false);
    try {
      const data = await agentApi.openPortal({ url: portalUrl });
      setBrowserUrl(data.url);
    } catch (err: any) {
      setPortalError(err.response?.data?.detail || "Failed to open browser. Check backend logs.");
    } finally {
      setOpeningPortal(false);
    }
  };

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
    setScreenshots([]);
    setEvidenceIds([]);
    setError(null);

    try {
      const data = await agentApi.run({
        prompt,
        control_id: controlId ? Number(controlId) : undefined,
        title: title || undefined,
        region_hint: regionHint || undefined,
      });
      setResult(data.result);
      setScreenshots(data.screenshots || []);
      setEvidenceIds(data.evidence_ids || []);
      setStatus("done");
      setIsPaused(false);

      if ((data.evidence_ids || []).length > 0) {
        queryClient.invalidateQueries({ queryKey: ["evidence"] });
        queryClient.invalidateQueries({ queryKey: ["submissions"] });
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Agent failed. Check backend logs.");
      setStatus("error");
    }
  };

  const handlePause = async () => {
    await agentApi.pause();
    setIsPaused(true);
  };

  const handleResume = async () => {
    await agentApi.resume();
    setIsPaused(false);
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

      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, mb: 3 }}>
        <Stack spacing={2.5}>
          <Stack direction="row" alignItems="center" spacing={1.25}>
            <Chip label="STEP 1" size="small" color="primary" sx={{ fontWeight: 700, height: 22 }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.72rem" }}>
              Open browser & log in manually
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Pick the portal you want the agent to use. A browser window will open — log in with your credentials and MFA <strong>yourself</strong>. The agent will not see or store your password.
          </Typography>

          <FormControl fullWidth>
            <InputLabel>Target Portal</InputLabel>
            <Select
              label="Target Portal"
              value={portalPreset}
              onChange={(e) => handlePresetChange(e.target.value as string)}
            >
              {PORTAL_PRESETS.map((p) => (
                <MenuItem key={p.label} value={p.label}>{p.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="URL"
            value={portalUrl}
            onChange={(e) => setPortalUrl(e.target.value)}
            placeholder="https://..."
            fullWidth
            disabled={portalPreset !== "Custom URL"}
          />

          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Button
              variant="contained"
              color="primary"
              onClick={handleOpenPortal}
              disabled={openingPortal}
              startIcon={openingPortal ? <CircularProgress size={16} color="inherit" /> : <ArrowRightIcon size={18} />}
            >
              {openingPortal ? "Opening browser..." : "Open Browser & Login"}
            </Button>
            {browserUrl && (
              <Button
                variant={loginDone ? "contained" : "outlined"}
                color={loginDone ? "success" : "inherit"}
                onClick={() => setLoginDone(true)}
                startIcon={loginDone ? <CircleCheckFilledIcon size={18} /> : undefined}
              >
                {loginDone ? "Login confirmed" : "I've logged in"}
              </Button>
            )}
          </Stack>

          {browserUrl && (
            <Alert severity={loginDone ? "success" : "info"}>
              Browser opened at <strong>{browserUrl}</strong>. Complete login + MFA in the browser window, then click <strong>"I've logged in"</strong> above.
            </Alert>
          )}
          {portalError && <Alert severity="error">{portalError}</Alert>}

          <Divider sx={{ my: 1 }} />

          <Stack direction="row" alignItems="center" spacing={1.25}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.72rem" }}>
              Environment context
            </Typography>
            <Chip label="Optional but recommended" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Tell the agent the right region / subscription / workspace. It will switch there <strong>before</strong> searching, so it doesn't look in the wrong place.
          </Typography>
          <TextField
            label="Environment hint"
            value={regionHint}
            onChange={(e) => setRegionHint(e.target.value)}
            placeholder='e.g. "AWS region: Asia Pacific (Mumbai) ap-south-1" or "Azure subscription: WSO2-Prod"'
            multiline
            rows={2}
            fullWidth
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, opacity: loginDone ? 1 : 0.55, pointerEvents: loginDone ? "auto" : "none" }}>
        <Box component="form" onSubmit={handleRun}>
          <Stack spacing={2.5}>
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <Chip label="STEP 2" size="small" color="primary" sx={{ fontWeight: 700, height: 22 }} />
              <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.72rem" }}>
                Run the AI agent
              </Typography>
            </Stack>

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

            <Alert severity="info" sx={{ "& .MuiAlert-message": { width: "100%" } }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                <strong>Tip:</strong> Use a numbered list to capture <strong>multiple screenshots in one run</strong> — one per task.
              </Typography>
              <Box component="pre" sx={{ m: 0, p: 1, fontSize: "0.78rem", backgroundColor: "rgba(0,0,0,0.04)", borderRadius: 1, whiteSpace: "pre-wrap" }}>
{`1. Go to S3, find bucket "cloud-care", screenshot the objects list
2. Go to EC2, find instance "cloud-care", screenshot the details page
3. Go to DynamoDB, find table "cloud-care", screenshot the items view`}
              </Box>
            </Alert>

            <TextField
              label="Prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={'Single task — e.g. "Go to Key Vault X and screenshot the access policy"\n\nOr a numbered list for multiple captures:\n1. Go to S3 cloud-care, screenshot objects\n2. Go to EC2 cloud-care, screenshot details'}
              multiline
              rows={6}
              required
              fullWidth
            />

            {prompt.trim() && (
              <Paper variant="outlined" sx={{ p: 1.5, backgroundColor: parsedTasks.length > 1 ? "rgba(76,175,80,0.07)" : "rgba(0,0,0,0.03)" }}>
                <Stack direction="row" alignItems="center" spacing={1} mb={parsedTasks.length > 1 ? 1 : 0}>
                  <Chip
                    label={`Detected ${parsedTasks.length} task${parsedTasks.length !== 1 ? "s" : ""}`}
                    size="small"
                    color={parsedTasks.length > 1 ? "success" : "default"}
                    sx={{ fontWeight: 700 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {parsedTasks.length > 1
                      ? "Each will produce one screenshot + one evidence record"
                      : "Single-task mode (no numbered/bulleted list detected)"}
                  </Typography>
                </Stack>
                {parsedTasks.length > 1 && (
                  <Stack spacing={0.5} sx={{ pl: 1 }}>
                    {parsedTasks.map((t, i) => (
                      <Typography key={i} variant="caption" sx={{ display: "block", fontFamily: "monospace" }}>
                        <strong>#{i + 1}</strong> {t.length > 100 ? t.slice(0, 100) + "..." : t}
                      </Typography>
                    ))}
                  </Stack>
                )}
              </Paper>
            )}

            <Stack direction="row" spacing={1.5} flexWrap="wrap">
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={status === "running"}
                startIcon={status === "running" ? <CircularProgress size={16} color="inherit" /> : <ArrowRightIcon size={18} />}
                sx={{ py: 1.25, flex: 1, minWidth: 200 }}
              >
                {status === "running" ? (isPaused ? "Paused..." : "Agent running...") : "Run Agent"}
              </Button>
              {status === "running" && parsedTasks.length > 1 && (
                isPaused ? (
                  <Button
                    variant="contained"
                    color="success"
                    size="large"
                    onClick={handleResume}
                    sx={{ py: 1.25 }}
                  >
                    Resume Agent
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    color="warning"
                    size="large"
                    onClick={handlePause}
                    sx={{ py: 1.25 }}
                  >
                    Pause after current task
                  </Button>
                )
              )}
            </Stack>
          </Stack>
        </Box>
      </Paper>

      {status === "running" && (
        <Paper variant="outlined" sx={{ mt: 3, overflow: "hidden" }}>
          <Box className="log-box">
            {isPaused ? (
              <div className="log-line">
                ⏸ <strong>Paused.</strong> The agent will wait at the next task boundary. Interact with the browser window (switch region, scroll, click) — then press <strong>Resume Agent</strong> when ready.
              </div>
            ) : (
              <div className="log-line">
                Agent is navigating the browser. This may take 30–120 seconds per task.
                {parsedTasks.length > 1 && ` Running ${parsedTasks.length} tasks sequentially.`}
              </div>
            )}
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
          {evidenceIds.length > 0 && (
            <Alert
              severity="success"
              icon={<CircleCheckFilledIcon size={18} />}
              sx={{ mb: 3 }}
            >
              Saved <strong>{evidenceIds.length} screenshot{evidenceIds.length > 1 ? "s" : ""}</strong> as Evidence {evidenceIds.map((id) => `#${id}`).join(", ")} (status: pending). Check the Evidence and History pages.
            </Alert>
          )}

          <Typography variant="h6" fontWeight={600} gutterBottom>
            Result
          </Typography>
          <Paper variant="outlined" sx={{ overflow: "hidden" }}>
            <Box className="log-box">
              <div className="log-line" style={{ whiteSpace: "pre-wrap" }}>{result}</div>
            </Box>
          </Paper>

          {screenshots.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Screenshots ({screenshots.length})
              </Typography>
              <Stack spacing={2}>
                {screenshots.map((shot, i) => (
                  <Paper key={shot.file_name} variant="outlined" sx={{ overflow: "hidden" }}>
                    <Box sx={{ px: 2, py: 1.25, backgroundColor: "rgba(0,0,0,0.03)", borderBottom: "1px solid", borderColor: "divider" }}>
                      <Stack direction="row" alignItems="center" spacing={1.25}>
                        <Chip label={`Task ${shot.subtask_index}`} size="small" color="primary" sx={{ fontWeight: 700 }} />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {shot.subtask}
                        </Typography>
                        {evidenceIds[i] && (
                          <Chip label={`Evidence #${evidenceIds[i]}`} size="small" variant="outlined" />
                        )}
                      </Stack>
                    </Box>
                    <Box sx={{ p: 1 }}>
                      <Box
                        component="img"
                        src={`http://localhost:8000${shot.file_url}`}
                        alt={`Screenshot of task ${shot.subtask_index}`}
                        sx={{ width: "100%", display: "block", borderRadius: 1 }}
                      />
                    </Box>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
