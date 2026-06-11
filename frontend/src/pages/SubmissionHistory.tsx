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
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import { ClockAsteriskIcon } from "@oxygen-ui/react-icons";
import { submissionsApi, evidenceApi, controlsApi, frameworksApi, productsApi } from "../api/client";

type Product = { id: number; name: string };
type Framework = { id: number; name: string; product_id: number };
type Control = { id: number; framework_id: number };
type Evidence = { id: number; control_id: number };
type Submission = {
  id: number;
  evidence_id: number;
  submitted_by: string;
  status: string;
  notes?: string | null;
  submitted_at: string;
};

const statusColor = (status: string): "warning" | "success" | "error" | "default" => {
  if (status === "pending") return "warning";
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  return "default";
};

export default function SubmissionHistory() {
  const [productId, setProductId] = useState<number | "">("");
  const [frameworkId, setFrameworkId] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<string>("");

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

  const visibleFrameworks = useMemo(
    () =>
      productId === ""
        ? allFrameworks
        : allFrameworks.filter((f) => f.product_id === Number(productId)),
    [allFrameworks, productId]
  );

  // Build evidence_id -> product_id lookup for filtering
  const evidenceToProduct = useMemo(() => {
    const controlIndex = new Map<number, Control>();
    allControls.forEach((c) => controlIndex.set(c.id, c));
    const frameworkIndex = new Map<number, Framework>();
    allFrameworks.forEach((f) => frameworkIndex.set(f.id, f));
    const result = new Map<number, { product_id: number; framework_id: number }>();
    allEvidence.forEach((e) => {
      const ctrl = controlIndex.get(e.control_id);
      if (!ctrl) return;
      const fw = frameworkIndex.get(ctrl.framework_id);
      if (!fw) return;
      result.set(e.id, { product_id: fw.product_id, framework_id: fw.id });
    });
    return result;
  }, [allEvidence, allControls, allFrameworks]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      const link = evidenceToProduct.get(s.evidence_id);
      if (productId !== "") {
        if (!link || link.product_id !== Number(productId)) return false;
      }
      if (frameworkId !== "") {
        if (!link || link.framework_id !== Number(frameworkId)) return false;
      }
      if (statusFilter !== "" && s.status !== statusFilter) return false;
      return true;
    });
  }, [submissions, evidenceToProduct, productId, frameworkId, statusFilter]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Submission History
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Complete audit trail of evidence submissions with reviewer notes.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} flexWrap="wrap">
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
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as string)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Stack>

      {isLoading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Evidence ID</TableCell>
                <TableCell>Submitted By</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ minWidth: 320 }}>Notes</TableCell>
                <TableCell>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredSubmissions.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>{s.id}</TableCell>
                  <TableCell>{s.evidence_id}</TableCell>
                  <TableCell>
                    <Chip
                      label={s.submitted_by}
                      size="small"
                      variant="outlined"
                      color={s.submitted_by === "ai-agent" ? "primary" : "default"}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={s.status} color={statusColor(s.status)} size="small" />
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: "0.875rem" }}>
                    {s.notes ?? "—"}
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>
                    {new Date(s.submitted_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
              {filteredSubmissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                    <Stack alignItems="center" spacing={1}>
                      <Box sx={{ color: "text.disabled" }}>
                        <ClockAsteriskIcon size={48} />
                      </Box>
                      <Typography color="text.secondary">
                        {submissions.length === 0 ? "No submissions yet" : "No submissions match the current filters"}
                      </Typography>
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
