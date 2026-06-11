import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { DocumentIcon, TrashIcon, BoltIcon, CircleUserIcon } from "@oxygen-ui/react-icons";
import { evidenceApi, frameworksApi, controlsApi, productsApi } from "../api/client";

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
  created_at: string;
};
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

export default function EvidenceList() {
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState<number | "">("");
  const [frameworkId, setFrameworkId] = useState<number | "">("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

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
  const { data: evidence = [], isLoading } = useQuery<Evidence[]>({
    queryKey: ["evidence"],
    queryFn: evidenceApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: evidenceApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evidence"] });
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
      setPendingDeleteId(null);
    },
  });

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

  const enriched = useMemo(() => {
    return evidence.map((e) => {
      const ctrl = controlById.get(e.control_id);
      const fw = ctrl ? frameworkById.get(ctrl.framework_id) : null;
      const product = fw ? productById.get(fw.product_id) : null;
      const isAI = typeof e.title === "string" && e.title.startsWith("AI Agent:");
      return { ...e, _control: ctrl, _framework: fw, _product: product, _isAI: isAI };
    });
  }, [evidence, controlById, frameworkById, productById]);

  const filtered = useMemo(() => {
    return enriched.filter((e) => {
      if (productId !== "" && e._framework?.product_id !== Number(productId)) return false;
      if (frameworkId !== "" && e._framework?.id !== Number(frameworkId)) return false;
      if (sourceFilter === "ai-agent" && !e._isAI) return false;
      if (sourceFilter === "manual" && e._isAI) return false;
      return true;
    });
  }, [enriched, productId, frameworkId, sourceFilter]);

  const stats = useMemo(() => {
    const total = enriched.length;
    const ai = enriched.filter((e) => e._isAI).length;
    const manual = total - ai;
    const productsCovered = new Set(enriched.map((e) => e._product?.id).filter(Boolean)).size;
    return { total, ai, manual, productsCovered };
  }, [enriched]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Evidence
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Files captured manually or via the AI agent, linked to compliance controls.
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: "wrap", rowGap: 2 }}>
        <StatCard label="Total" value={stats.total} />
        <StatCard label="AI-generated" value={stats.ai} accent="primary.main" />
        <StatCard label="Manual upload" value={stats.manual} />
        <StatCard label="Products covered" value={stats.productsCovered} />
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ xs: "stretch", md: "center" }} flexWrap="wrap" rowGap={2}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
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
          <FormControl size="small" sx={{ minWidth: 200 }} disabled={!visibleFrameworks.length}>
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
            Showing <strong>{filtered.length}</strong> of {enriched.length}
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
                <TableCell sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.04em" }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.04em" }}>Evidence</TableCell>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.04em" }}>Control</TableCell>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.04em" }}>Source</TableCell>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.04em" }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((e) => {
                const displayText = (e.description?.trim() || e.title || "Untitled").replace(/^AI Agent:\s*/, "");
                const isPendingDelete = pendingDeleteId === e.id;
                return (
                  <TableRow key={e.id} hover sx={{ verticalAlign: "top" }}>
                    <TableCell sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                      <Tooltip title={new Date(e.created_at).toLocaleString()}>
                        <span>{relativeTime(e.created_at)}</span>
                      </Tooltip>
                    </TableCell>

                    <TableCell sx={{ minWidth: 320, maxWidth: 460 }}>
                      <Stack direction="row" spacing={1.5} alignItems="flex-start">
                        <Tooltip title="Open full screenshot">
                          <Link
                            href={`http://localhost:8000${e.file_url}`}
                            target="_blank"
                            rel="noreferrer"
                            sx={{ display: "block", flexShrink: 0, lineHeight: 0 }}
                          >
                            <Box
                              component="img"
                              src={`http://localhost:8000${e.file_url}`}
                              alt=""
                              sx={{
                                width: 72,
                                height: 52,
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
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {displayText}
                          </Typography>
                          <Link
                            href={`http://localhost:8000${e.file_url}`}
                            target="_blank"
                            rel="noreferrer"
                            underline="hover"
                            sx={{ fontSize: "0.72rem", fontWeight: 600, color: "primary.main", alignSelf: "flex-start" }}
                          >
                            View screenshot →
                          </Link>
                        </Stack>
                      </Stack>
                    </TableCell>

                    <TableCell>
                      {e._control ? (
                        <Stack spacing={0.5}>
                          {e._product && (
                            <Chip
                              label={e._product.name}
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
                            label={`${e._framework?.name ?? "?"} · ${e._control.control_ref}`}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600, alignSelf: "flex-start" }}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                            {e._control.title}
                          </Typography>
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Chip
                        icon={e._isAI ? <BoltIcon size={14} /> : <CircleUserIcon size={14} />}
                        label={e._isAI ? "AI Agent" : "Manual"}
                        size="small"
                        color={e._isAI ? "primary" : "default"}
                        variant={e._isAI ? "filled" : "outlined"}
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>

                    <TableCell align="right">
                      {isPendingDelete ? (
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => setPendingDeleteId(null)}
                            disabled={deleteMutation.isPending}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            variant="contained"
                            onClick={() => deleteMutation.mutate(e.id)}
                            disabled={deleteMutation.isPending}
                          >
                            Confirm
                          </Button>
                        </Stack>
                      ) : (
                        <Button
                          size="small"
                          color="error"
                          variant="text"
                          startIcon={<TrashIcon size={16} />}
                          onClick={() => setPendingDeleteId(e.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                    <Stack alignItems="center" spacing={1}>
                      <Box sx={{ color: "text.disabled" }}>
                        <DocumentIcon size={48} />
                      </Box>
                      <Typography color="text.secondary">
                        {enriched.length === 0 ? "No evidence found" : "No evidence matches the current filters"}
                      </Typography>
                      {enriched.length === 0 ? (
                        <Typography variant="caption" color="text.disabled">
                          Upload via Submit or run the AI agent.
                        </Typography>
                      ) : (
                        <Link
                          component="button"
                          type="button"
                          underline="hover"
                          sx={{ fontSize: "0.85rem" }}
                          onClick={() => {
                            setProductId("");
                            setFrameworkId("");
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
