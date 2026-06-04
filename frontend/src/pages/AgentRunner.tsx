import { useEffect, useRef, useState } from "react";
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
import Fab from "@mui/material/Fab";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { BoltIcon, ArrowRightIcon, CircleCheckFilledIcon, LightbulbOnIcon, XMarkIcon } from "@oxygen-ui/react-icons";
import { agentApi, frameworksApi, controlsApi } from "../api/client";
import "../index.css";

const PORTAL_PRESETS: { label: string; url: string }[] = [
  { label: "Azure Portal", url: "https://portal.azure.com" },
  { label: "AWS Console", url: "https://console.aws.amazon.com" },
  { label: "WSO2 Identity Server (Cloud)", url: "https://console.asgardeo.io" },
  { label: "Custom URL", url: "" },
];

const SUBTASK_RE = /^\s*(?:\d+[.)\-:]?|[-*•►▶→])\s+(.+)$/;

const SS_PREFIX = "compliance.agent.v1.";

function useSessionState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const fullKey = SS_PREFIX + key;
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(fullKey);
      return stored !== null ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(fullKey, JSON.stringify(value));
    } catch {
      /* quota / serialize errors — ignore, in-memory state still works */
    }
  }, [fullKey, value]);
  return [value, setValue];
}

function clearSessionState(...keys: string[]) {
  keys.forEach((k) => sessionStorage.removeItem(SS_PREFIX + k));
}

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

type SubtaskState = {
  index: number;
  text: string;
  status: "pending" | "running" | "completed";
  result?: string | null;
  screenshot?: { file_name: string; file_url: string; subtask: string; subtask_index: number } | null;
  evidence_id?: number | null;
  submission_id?: number | null;
  modification?: string;
  started_at?: number;
  completed_at?: number;
};

type RunState = {
  run_id: string;
  status: "starting" | "running" | "paused" | "completed" | "error";
  current_index: number;
  subtasks: SubtaskState[];
  error?: string | null;
  started_at?: number;
  completed_at?: number | null;
};

export default function AgentRunner() {
  const queryClient = useQueryClient();
  const [frameworkId, setFrameworkId] = useSessionState<number | "">("frameworkId", "");
  const [controlId, setControlId] = useSessionState<number | "">("controlId", "");
  const [title, setTitle] = useSessionState<string>("title", "");
  const [prompt, setPrompt] = useSessionState<string>("prompt", "");
  const [status, setStatus] = useSessionState<"idle" | "running" | "done" | "error">("status", "idle");
  const [error, setError] = useState<string | null>(null);

  const [runId, setRunId] = useSessionState<string | null>("runId", null);
  const [runState, setRunState] = useSessionState<RunState | null>("runState", null);
  const [nextTaskMod, setNextTaskMod] = useState<string>("");
  const [modSavedFor, setModSavedFor] = useState<number | null>(null);
  const lastInvalidatedCountRef = useRef<number>(0);

  const [portalPreset, setPortalPreset] = useSessionState<string>("portalPreset", "Azure Portal");
  const [portalUrl, setPortalUrl] = useSessionState<string>("portalUrl", "https://portal.azure.com");
  const [openingPortal, setOpeningPortal] = useState(false);
  const [browserUrl, setBrowserUrl] = useSessionState<string | null>("browserUrl", null);
  const [loginDone, setLoginDone] = useSessionState<boolean>("loginDone", false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [regionHint, setRegionHint] = useSessionState<string>("regionHint", "");
  const [complexity, setComplexity] = useSessionState<"quick" | "standard" | "thorough">("complexity", "standard");
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSeen, setHelpSeen] = useSessionState<boolean>("helpSeen", false);
  const parsedTasks = parseSubtasksClient(prompt);
  const maxStepsForComplexity = complexity === "quick" ? 15 : complexity === "thorough" ? 40 : 25;

  const openHelp = () => {
    setHelpOpen(true);
    setHelpSeen(true);
  };

  const isPaused = runState?.status === "paused";

  const handleStartNewRun = () => {
    clearSessionState("runId", "runState", "prompt", "status");
    setRunId(null);
    setRunState(null);
    setPrompt("");
    setStatus("idle");
    setNextTaskMod("");
    setModSavedFor(null);
    setError(null);
    lastInvalidatedCountRef.current = 0;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
    setError(null);
    setRunState(null);
    setNextTaskMod("");
    setModSavedFor(null);
    lastInvalidatedCountRef.current = 0;

    try {
      const { run_id } = await agentApi.startRun({
        prompt,
        control_id: controlId ? Number(controlId) : undefined,
        title: title || undefined,
        region_hint: regionHint || undefined,
        max_steps_per_task: maxStepsForComplexity,
      });
      setRunId(run_id);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to start agent. Check backend logs.");
      setStatus("error");
    }
  };

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const tick = async () => {
      while (!cancelled) {
        try {
          const data = await agentApi.getRun(runId);
          if (cancelled) break;
          setRunState(data);

          const completedCount = (data.subtasks || []).filter((s: SubtaskState) => s.evidence_id).length;
          if (completedCount > lastInvalidatedCountRef.current) {
            queryClient.invalidateQueries({ queryKey: ["evidence"] });
            queryClient.invalidateQueries({ queryKey: ["submissions"] });
            lastInvalidatedCountRef.current = completedCount;
          }

          if (data.status === "completed") { setStatus("done"); break; }
          if (data.status === "error") { setStatus("error"); setError(data.error || "Agent error"); break; }
          if (data.status === "running" || data.status === "paused" || data.status === "starting") {
            setStatus("running");
          }
        } catch (err: any) {
          if (!cancelled) {
            // run_id from a prior backend process — clear stale state
            const isMissing = err?.response?.status === 404;
            if (isMissing) {
              clearSessionState("runId", "runState", "status");
              setRunId(null);
              setRunState(null);
              setStatus("idle");
            } else {
              setStatus("error");
              setError("Lost connection to backend");
            }
          }
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    tick();
    return () => { cancelled = true; };
  }, [runId, queryClient, setRunState, setStatus, setRunId]);

  const handlePause = async () => {
    await agentApi.pause();
  };

  const handleResume = async () => {
    if (runId && nextTaskMod.trim() && modSavedFor !== (runState?.current_index ?? -1) + 1) {
      try {
        await agentApi.modifyNext(runId, nextTaskMod);
        setModSavedFor((runState?.current_index ?? -1) + 1);
      } catch (err) {
        // proceed anyway
      }
    }
    await agentApi.resume();
  };

  const handleSaveModification = async () => {
    if (!runId || !nextTaskMod.trim()) return;
    try {
      const data = await agentApi.modifyNext(runId, nextTaskMod);
      setModSavedFor(data.modified_index);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save modification");
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

            <FormControl fullWidth>
              <InputLabel>Task complexity</InputLabel>
              <Select
                label="Task complexity"
                value={complexity}
                onChange={(e) => setComplexity(e.target.value as "quick" | "standard" | "thorough")}
              >
                <MenuItem value="quick">Quick — 15 steps per task (simple navigation, single location)</MenuItem>
                <MenuItem value="standard">Standard — 25 steps per task (default, multi-step within one region)</MenuItem>
                <MenuItem value="thorough">Thorough — 40 steps per task (multi-region, deep search, complex)</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1, pl: 0.5 }}>
              A "step" is one agent action (click, type, scroll, screenshot). Pick Thorough when crossing regions or doing fuzzy searches.
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

      {status === "error" && !runState && (
        <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>
      )}

      {runState && (
        <Box sx={{ mt: 3 }}>
          <RunTimeline
            runState={runState}
            isPaused={isPaused}
            nextTaskMod={nextTaskMod}
            setNextTaskMod={setNextTaskMod}
            onSaveModification={handleSaveModification}
            modSavedFor={modSavedFor}
            error={error}
          />

          {(runState.status === "completed" || runState.status === "error") && (
            <Paper variant="outlined" sx={{ mt: 3, p: 2.5, backgroundColor: "rgba(255,115,0,0.05)" }}>
              <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "stretch", sm: "center" }} spacing={2}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Run finished — start another?
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Your login session and environment context are kept. Just type a new prompt.
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleStartNewRun}
                  startIcon={<ArrowRightIcon size={18} />}
                  sx={{ minWidth: 200 }}
                >
                  Start a New Run
                </Button>
              </Stack>
            </Paper>
          )}
        </Box>
      )}

      <Tooltip title="Quick guide" placement="left">
        <Fab
          color="primary"
          aria-label="Open quick guide"
          onClick={openHelp}
          sx={{
            position: "fixed",
            bottom: 28,
            right: 28,
            zIndex: 1200,
            boxShadow: "0 6px 16px rgba(255,115,0,0.35)",
            animation: helpSeen ? "none" : "pulseHelp 2.4s ease-in-out infinite",
            "@keyframes pulseHelp": {
              "0%, 100%": { transform: "scale(1)", boxShadow: "0 6px 16px rgba(255,115,0,0.35)" },
              "50%": { transform: "scale(1.08)", boxShadow: "0 10px 26px rgba(255,115,0,0.55)" },
            },
            "&::after": helpSeen
              ? {}
              : {
                  content: '""',
                  position: "absolute",
                  inset: -4,
                  borderRadius: "50%",
                  border: "2px solid",
                  borderColor: "primary.main",
                  opacity: 0,
                  animation: "ringHelp 2.4s ease-out infinite",
                },
            "@keyframes ringHelp": {
              "0%": { transform: "scale(1)", opacity: 0.6 },
              "100%": { transform: "scale(1.5)", opacity: 0 },
            },
          }}
        >
          <LightbulbOnIcon size={22} />
        </Fab>
      </Tooltip>

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pr: 6, pb: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box sx={{ color: "primary.main", display: "flex" }}>
              <LightbulbOnIcon size={24} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                Quick Guide
              </Typography>
              <Typography variant="caption" color="text.secondary">
                How to use the AI Agent in under a minute
              </Typography>
            </Box>
          </Stack>
          <IconButton
            onClick={() => setHelpOpen(false)}
            sx={{ position: "absolute", right: 12, top: 12 }}
            size="small"
          >
            <XMarkIcon size={18} />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2.75}>
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <Chip label="1" size="small" color="primary" sx={{ fontWeight: 700, minWidth: 26, height: 22 }} />
                <Typography variant="subtitle1" fontWeight={700}>
                  Open Browser & Log In
                </Typography>
              </Stack>
              <Stack spacing={0.4} sx={{ pl: 4.5 }}>
                <Typography variant="body2">• Pick a target portal (Azure / AWS / WSO2)</Typography>
                <Typography variant="body2">• Click <strong>Open Browser & Login</strong> — a Chrome window opens</Typography>
                <Typography variant="body2">• Log in <strong>yourself</strong> with your credentials + MFA</Typography>
                <Typography variant="body2">• Click <strong>I've logged in</strong> when done</Typography>
              </Stack>
            </Box>

            <Box>
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <Chip label="2" size="small" color="primary" sx={{ fontWeight: 700, minWidth: 26, height: 22 }} />
                <Typography variant="subtitle1" fontWeight={700}>
                  Tell the Agent What to Do
                </Typography>
              </Stack>
              <Stack spacing={0.4} sx={{ pl: 4.5 }}>
                <Typography variant="body2">• Set <strong>Environment Hint</strong> — e.g. <em>"AWS region: Mumbai ap-south-1"</em></Typography>
                <Typography variant="body2">• Choose <strong>Task complexity</strong>: Quick (15) / Standard (25) / Thorough (40 steps)</Typography>
                <Typography variant="body2">• Type your task — one line for a single capture, or numbered list for multiple:</Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    mt: 0.5,
                    p: 1.25,
                    fontSize: "0.74rem",
                    backgroundColor: "rgba(0,0,0,0.04)",
                    borderRadius: 1,
                    whiteSpace: "pre-wrap",
                    fontFamily: "monospace",
                  }}
                >
{`1. Go to S3 cloud-care, screenshot objects
2. Go to EC2 cloud-care, screenshot details
3. Go to DynamoDB cloudcare-tf, screenshot items`}
                </Box>
                <Typography variant="body2">• (Optional) Link to a compliance Control to auto-create Evidence rows</Typography>
              </Stack>
            </Box>

            <Box>
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <Chip label="3" size="small" color="primary" sx={{ fontWeight: 700, minWidth: 26, height: 22 }} />
                <Typography variant="subtitle1" fontWeight={700}>
                  While the Agent Runs
                </Typography>
              </Stack>
              <Stack spacing={0.4} sx={{ pl: 4.5 }}>
                <Typography variant="body2">• Watch the live timeline — each task moves from pending → running → done</Typography>
                <Typography variant="body2">• Screenshots appear one by one as they're captured</Typography>
                <Typography variant="body2">• Click <strong>Pause</strong> to intervene → fix the browser manually → click <strong>Resume</strong></Typography>
                <Typography variant="body2">• While paused, type extra instructions for the next task</Typography>
              </Stack>
            </Box>

            <Box
              sx={{
                backgroundColor: "rgba(255,115,0,0.07)",
                borderRadius: 1.5,
                p: 1.75,
                borderLeft: "3px solid",
                borderColor: "primary.main",
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <Box sx={{ color: "primary.main", display: "flex" }}>
                  <LightbulbOnIcon size={18} />
                </Box>
                <Typography variant="subtitle2" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Pro Tips
                </Typography>
              </Stack>
              <Stack spacing={0.5}>
                <Typography variant="body2">★ Always set Environment Hint for cross-region work — saves the agent from searching the wrong region</Typography>
                <Typography variant="body2">★ Pick <strong>Thorough</strong> when fuzzy-searching across services or regions</Typography>
                <Typography variant="body2">★ Use <strong>Pause</strong> to manually switch region/tab mid-run — the next task picks up from your state</Typography>
                <Typography variant="body2">★ Your session persists across page navigation — closing the tab is the only "logout"</Typography>
                <Typography variant="body2">★ The agent <strong>never sees your password</strong> — only you log in</Typography>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setHelpOpen(false)} variant="contained">
            Got it
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function RunTimeline({
  runState,
  isPaused,
  nextTaskMod,
  setNextTaskMod,
  onSaveModification,
  modSavedFor,
  error,
}: {
  runState: RunState;
  isPaused: boolean;
  nextTaskMod: string;
  setNextTaskMod: (v: string) => void;
  onSaveModification: () => void;
  modSavedFor: number | null;
  error: string | null;
}) {
  const total = runState.subtasks.length;
  const completedCount = runState.subtasks.filter((s) => s.status === "completed").length;
  const currentIdx = runState.current_index;
  const nextIdx = currentIdx + 1;
  const evidenceIds = runState.subtasks.map((s) => s.evidence_id).filter((x): x is number => !!x);
  const overallStatus = runState.status;
  const elapsed =
    runState.started_at
      ? Math.round(((runState.completed_at || Date.now() / 1000) - runState.started_at))
      : 0;

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
          <Chip
            label={
              overallStatus === "completed"
                ? "All tasks done"
                : overallStatus === "paused"
                ? "Paused — waiting for you"
                : overallStatus === "error"
                ? "Error"
                : overallStatus === "starting"
                ? "Starting agent..."
                : `Running task ${currentIdx + 1} of ${total}`
            }
            color={
              overallStatus === "completed"
                ? "success"
                : overallStatus === "paused"
                ? "warning"
                : overallStatus === "error"
                ? "error"
                : "primary"
            }
            sx={{ fontWeight: 700 }}
            icon={overallStatus === "running" || overallStatus === "starting" ? <CircularProgress size={14} color="inherit" /> : undefined}
          />
          <Typography variant="caption" color="text.secondary">
            {completedCount} of {total} screenshots captured · {elapsed}s elapsed
            {evidenceIds.length > 0 && ` · Evidence ${evidenceIds.map((id) => `#${id}`).join(", ")}`}
          </Typography>
        </Stack>
        {overallStatus === "error" && error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>
        )}
      </Paper>

      {isPaused && nextIdx < total && (
        <Paper variant="outlined" sx={{ p: 2, backgroundColor: "rgba(255,165,0,0.07)", borderColor: "warning.main" }}>
          <Stack spacing={1.5}>
            <Typography variant="subtitle2" fontWeight={700}>
              ⏸ Paused — you can intervene now
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The browser is yours. Switch tabs, change region, scroll, click — whatever the agent needs you to fix. Optionally add extra instructions for the next task:
            </Typography>
            <TextField
              label={`Extra instructions for Task ${nextIdx + 1}`}
              value={nextTaskMod}
              onChange={(e) => setNextTaskMod(e.target.value)}
              placeholder='e.g. "Switch to Mumbai region first" or "Look for cloudcare-tf-locks-v2, not the v1 one"'
              multiline
              rows={2}
              fullWidth
            />
            <Stack direction="row" spacing={1.5}>
              <Button
                variant="outlined"
                size="small"
                onClick={onSaveModification}
                disabled={!nextTaskMod.trim() || modSavedFor === nextIdx}
              >
                {modSavedFor === nextIdx ? "Saved ✓" : "Save instruction"}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
                Then press <strong>Resume Agent</strong> above
              </Typography>
            </Stack>
          </Stack>
        </Paper>
      )}

      {runState.subtasks.map((task) => (
        <Paper key={task.index} variant="outlined" sx={{ overflow: "hidden" }}>
          <Box sx={{ px: 2, py: 1.25, backgroundColor: "rgba(0,0,0,0.03)", borderBottom: "1px solid", borderColor: "divider" }}>
            <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap">
              <Chip
                label={`Task ${task.index + 1}`}
                size="small"
                color={
                  task.status === "completed"
                    ? "success"
                    : task.status === "running"
                    ? "primary"
                    : "default"
                }
                sx={{ fontWeight: 700 }}
                icon={
                  task.status === "completed" ? (
                    <CircleCheckFilledIcon size={14} />
                  ) : task.status === "running" ? (
                    <CircularProgress size={12} color="inherit" />
                  ) : undefined
                }
              />
              <Typography variant="body2" sx={{ fontWeight: 500, flex: 1, minWidth: 0 }}>
                {task.text}
              </Typography>
              {task.evidence_id && (
                <Chip label={`Evidence #${task.evidence_id}`} size="small" variant="outlined" />
              )}
              {task.modification && (
                <Chip label="Modified" size="small" color="warning" variant="outlined" />
              )}
            </Stack>
            {task.modification && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, pl: 0.5, fontStyle: "italic" }}>
                + {task.modification}
              </Typography>
            )}
          </Box>

          {task.status === "pending" && (
            <Box sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary">⏳ Waiting...</Typography>
            </Box>
          )}

          {task.status === "running" && !task.screenshot && (
            <Box sx={{ p: 2, textAlign: "center" }}>
              <CircularProgress size={20} />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                Agent is working on this task...
              </Typography>
            </Box>
          )}

          {task.screenshot && (
            <Box sx={{ p: 1 }}>
              <Box
                component="img"
                src={`http://localhost:8000${task.screenshot.file_url}`}
                alt={`Screenshot of task ${task.index + 1}`}
                sx={{ width: "100%", display: "block", borderRadius: 1 }}
              />
            </Box>
          )}

          {task.result && task.status === "completed" && (
            <Box sx={{ px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider", backgroundColor: "rgba(0,0,0,0.02)" }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", mb: 0.5 }}>
                Agent report
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.78rem", whiteSpace: "pre-wrap" }}>
                {task.result}
              </Typography>
            </Box>
          )}
        </Paper>
      ))}
    </Stack>
  );
}
