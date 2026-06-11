import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Link from "@mui/material/Link";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import {
  ClockAsteriskIcon,
  BoltIcon,
  CircleUserIcon,
  CircleCheckFilledIcon,
  XMarkIcon,
} from "@oxygen-ui/react-icons";
import { submissionsApi, evidenceApi, controlsApi, frameworksApi, productsApi } from "../api/client";

type Product = { id: number; name: string };
type Framework = { id: number; name: string; product_id: number };
type Control = { id: number; framework_id: number; control_ref: string; title: string };
type Evidence = {
  id: number;
  title: string;
  description?: string | null;
  file_name: string;
  file_url: string;
  control_id: number;
};
type Submission = {
  id: number;
  evidence_id: number;
  submitted_by: string;
  status: string;
  notes?: string | null;
  submitted_at: string;
};

type StatusFilter = "all" | "pending" | "approved" | "rejected";
type SourceFilter = "all" | "ai-agent" | "manual";

function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  if (diffDay < 30) {
    const w = Math.floor(diffDay / 7);
    return `${w} week${w > 1 ? "s" : ""} ago`;
  }
  return date.toLocaleDateString();
}

function statusChipProps(status: string) {
  const map = {
    pending: { color: "warning" as const, label: "Pending", Icon: ClockAsteriskIcon },
    approved: { color: "success" as const, label: "Approved", Icon: CircleCheckFilledIcon },
    rejected: { color: "error" as const, label: "Rejected", Icon: XMarkIcon },
  };
  return map[status as keyof typeof map] ?? { color: "default" as const, label: status, Icon: ClockAsteriskIcon };
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.25, flex: 1, minWidth: 160 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}
      >
        {label}
      </Typography>
      <Typography variant="h4" fontWeight={700} sx={{ mt: 0.25, color: accent ?? "text.primary" }}>
        {value}
      </Typography>
    </Paper>
  );
}

export default function SubmissionHistory() {
  const [productId, setProductId] = useState<number | "">("");
  const [frameworkId, setFrameworkId] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: submissions = [], isLoading } = useQuery<Submission[]>({
    queryKey: ["submissions"],
    queryFn: submissionsApi.list,
  });
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: productsApi.list,
  });
  const { data: allFrameworks = [] } = useQuery<Framework[]>({
    queryKey: ["frameworks"],
    queryFn: () => frameworksApi.list(),
  });
  const { data: allControls = [] } = useQuery<Control[]>({
    queryKey: ["controls"],
    queryFn: () => controlsApi.list(),
  });
  const { data: allEvidence = [] } = useQuery<Evidence[]>({
    queryKey: ["evidence"],
    queryFn: evidenceApi.list,
  });

  const evidenceById = useMemo(() => {
    const m = new Map<number, Evidence>();
    allEvidence.forEach((e) => m.set(e.id, e));
    return m;
  }, [allEvidence]);
  const controlById = useMemo(() => {
    const m = new Map<number, Control>();
    allControls.forEach((c) => m.set(c.id, c));
    return m;
  }, [allControls]);
  const frameworkById = useMemo(() => {
    const m = new Map<number, Framework>();
    allFrameworks.forEach((f) => m.set(f.id, f));
    return m;
  }, [allFrameworks]);
  const productById = useMemo(() => {
    const m = new Map<number, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const visibleFrameworks = useMemo(
    () =>
      productId === ""
        ? allFrameworks
        : allFrameworks.filter((f) => f.product_id === Number(productId)),
    [allFrameworks, productId]
  );

  const filtered = useMemo(() => {
    return submissions.filter((s) => {
      const ev = evidenceById.get(s.evidence_id);
      const ctrl = ev ? controlById.get(ev.control_id) : null;
      const fw = ctrl ? frameworkById.get(ctrl.framework_id) : null;

      if (productId !== "" && (!fw || fw.product_id !== Number(productId))) return false;
      if (frameworkId !== "" && (!fw || fw.id !== Number(frameworkId))) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (sourceFilter === "ai-agent" && s.submitted_by !== "ai-agent") return false;
      if (sourceFilter === "manual" && s.submitted_by === "ai-agent") return false;
      return true;
    });
  }, [submissions, evidenceById, controlById, frameworkById, productId, frameworkId, statusFilter, sourceFilter]);

  const stats = useMemo(() => {
    const total = submissions.length;
    const pending = submissions.filter((s) => s.status === "pending").length;
    const ai = submissions.filter((s) => s.submitted_by === "ai-agent").length;
    const manual = total - ai;
    return { total, pending, ai, manual };
  }, [submissions]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Submission History
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Complete audit trail of evidence submissions — manual uploads and AI-captured screenshots.
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: "wrap", rowGap: 2 }}>
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Pending review" value={stats.pending} accent="warning.main" />
        <StatCard label="AI-generated" value={stats.ai} accent="primary.main" />
        <StatCard label="Manual upload" value={stats.manual} />
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ xs: "stretch", md: "center" }} flexWrap="wrap" rowGap={2}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Product</InputLabel>
            <Select
              label="Product"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value as number | "");
                setFrameworkId("");
              }}
            >
              <MenuItem value="">All Products</MenuItem>
              {products.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }} disabled={!visibleFrameworks.length}>
            <InputLabel>Framework</InputLabel>
            <Select
              label="Framework"
              value={frameworkId}
              onChange={(e) => setFrameworkId(e.target.value as number | "")}
            >
              <MenuItem value="">All Frameworks</MenuItem>
              {visibleFrameworks.map((f) => (
                <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
              Status
            </Typography>
            <ToggleButtonGroup
              value={statusFilter}
              exclusive
              size="small"
              onChange={(_, v) => v && setStatusFilter(v)}
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="pending">Pending</ToggleButton>
              <ToggleButton value="approved">Approved</ToggleButton>
              <ToggleButton value="rejected">Rejected</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
              Source
            </Typography>
            <ToggleButtonGroup
              value={sourceFilter}
              exclusive
              size="small"
              onChange={(_, v) => v && setSourceFilter(v)}
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="ai-agent">AI Agent</ToggleButton>
              <ToggleButton value="manual">Manual</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ flex: 1 }} />
          <Typography variant="body2" color="text.secondary">
            Showing <strong>{filtered.length}</strong> of {submissions.length}
          </Typography>
        </Stack>
      </Paper>

      {isLoading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.04em" }}>When</TableCell>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.04em" }}>Evidence</TableCell>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.04em" }}>Control</TableCell>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.04em" }}>Source</TableCell>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.04em" }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.04em", minWidth: 260 }}>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((s) => {
                const ev = evidenceById.get(s.evidence_id);
                const ctrl = ev ? controlById.get(ev.control_id) : null;
                const fw = ctrl ? frameworkById.get(ctrl.framework_id) : null;
                const product = fw ? productById.get(fw.product_id) : null;
                const isAI = s.submitted_by === "ai-agent";
                const status = statusChipProps(s.status);
                const Icon = status.Icon;
                const isExpanded = expandedId === s.id;
                const notes = s.notes ?? "";
                const isLong = notes.length > 140;
                const shortNotes = isLong ? notes.slice(0, 140).trimEnd() + "…" : notes;

                return (
                  <TableRow key={s.id} hover sx={{ verticalAlign: "top" }}>
                    <TableCell sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                      <Tooltip title={new Date(s.submitted_at).toLocaleString()}>
                        <span>{relativeTime(s.submitted_at)}</span>
                      </Tooltip>
                    </TableCell>

                    <TableCell sx={{ minWidth: 260, maxWidth: 360 }}>
                      {ev ? (
                        <Stack direction="row" spacing={1.5} alignItems="flex-start">
                          <Tooltip title="Open full screenshot">
                            <Link
                              href={`http://localhost:8000${ev.file_url}`}
                              target="_blank"
                              rel="noreferrer"
                              sx={{ display: "block", flexShrink: 0, lineHeight: 0 }}
                            >
                              <Box
                                component="img"
                                src={`http://localhost:8000${ev.file_url}`}
                                alt=""
                                sx={{
                                  width: 64,
                                  height: 48,
                                  objectFit: "cover",
                                  borderRadius: 1,
                                  border: "1px solid",
                                  borderColor: "divider",
                                  display: "block",
                                  transition: "transform 0.15s ease",
                                  "&:hover": { transform: "scale(1.05)", borderColor: "primary.main" },
                                }}
                              />
                            </Link>
                          </Tooltip>
                          <Stack spacing={0.4} sx={{ minWidth: 0, flex: 1 }}>
                            <Typography
                              variant="body2"
                              fontWeight={500}
                              sx={{
                                lineHeight: 1.35,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {(ev.description?.trim() || ev.title || "Untitled").replace(/^AI Agent:\s*/, "")}
                            </Typography>
                            <Link
                              href={`http://localhost:8000${ev.file_url}`}
                              target="_blank"
                              rel="noreferrer"
                              underline="hover"
                              sx={{ fontSize: "0.72rem", fontWeight: 600, color: "primary.main", alignSelf: "flex-start" }}
                            >
                              View screenshot →
                            </Link>
                          </Stack>
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          Evidence removed
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      {ctrl ? (
                        <Stack spacing={0.5}>
                          {product && (
                            <Chip
                              label={product.name}
                              size="small"
                              sx={{
                                alignSelf: "flex-start",
                                height: 20,
                                fontSize: "0.65rem",
                                fontWeight: 700,
                                backgroundColor: "rgba(255,115,0,0.10)",
                                color: "primary.main",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                              }}
                            />
                          )}
                          <Chip
                            label={`${fw?.name ?? "?"} · ${ctrl.control_ref}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600, alignSelf: "flex-start" }}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                            {ctrl.title}
                          </Typography>
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Chip
                        icon={isAI ? <BoltIcon size={14} /> : <CircleUserIcon size={14} />}
                        label={isAI ? "AI Agent" : "Manual"}
                        size="small"
                        color={isAI ? "primary" : "default"}
                        variant={isAI ? "filled" : "outlined"}
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>

                    <TableCell>
                      <Chip
                        icon={<Icon size={14} />}
                        label={status.label}
                        size="small"
                        color={status.color}
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>

                    <TableCell sx={{ color: "text.secondary", fontSize: "0.875rem", maxWidth: 420 }}>
                      {notes ? (
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                            {isExpanded || !isLong ? notes : shortNotes}
                          </Typography>
                          {isLong && (
                            <Link
                              component="button"
                              type="button"
                              underline="hover"
                              sx={{ fontSize: "0.75rem", fontWeight: 600, mt: 0.5 }}
                              onClick={() => setExpandedId(isExpanded ? null : s.id)}
                            >
                              {isExpanded ? "Show less" : "Show more"}
                            </Link>
                          )}
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                    <Stack alignItems="center" spacing={1}>
                      <Box sx={{ color: "text.disabled" }}>
                        <ClockAsteriskIcon size={48} />
                      </Box>
                      <Typography color="text.secondary">
                        {submissions.length === 0 ? "No submissions yet" : "No submissions match the current filters"}
                      </Typography>
                      {submissions.length > 0 && (
                        <Link
                          component="button"
                          type="button"
                          underline="hover"
                          sx={{ fontSize: "0.85rem" }}
                          onClick={() => {
                            setProductId("");
                            setFrameworkId("");
                            setStatusFilter("all");
                            setSourceFilter("all");
                          }}
                        >
                          Clear filters
                        </Link>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
