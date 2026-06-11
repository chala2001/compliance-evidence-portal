import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import { DocumentIcon, EnvelopeIcon, HierarchyIcon, ClockAsteriskIcon } from "@oxygen-ui/react-icons";
import { evidenceApi, submissionsApi, frameworksApi, productsApi, controlsApi } from "../api/client";

type Product = { id: number; name: string };
type Framework = { id: number; name: string; product_id: number };
type Control = { id: number; framework_id: number };
type Evidence = { id: number; control_id: number };
type Submission = { id: number; evidence_id: number; submitted_by: string; status: string; submitted_at: string };

const statusColor = (status: string): "warning" | "success" | "error" | "default" => {
  if (status === "pending") return "warning";
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  return "default";
};

export default function Dashboard() {
  const [productId, setProductId] = useState<number | "">("");

  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["products"], queryFn: productsApi.list });
  const { data: allFrameworks = [] } = useQuery<Framework[]>({ queryKey: ["frameworks"], queryFn: () => frameworksApi.list() });
  const { data: allControls = [] } = useQuery<Control[]>({ queryKey: ["controls"], queryFn: () => controlsApi.list() });
  const { data: allEvidence = [] } = useQuery<Evidence[]>({ queryKey: ["evidence"], queryFn: evidenceApi.list });
  const { data: allSubmissions = [] } = useQuery<Submission[]>({ queryKey: ["submissions"], queryFn: submissionsApi.list });

  const { frameworks, evidence, submissions } = useMemo(() => {
    if (productId === "") {
      return { frameworks: allFrameworks, evidence: allEvidence, submissions: allSubmissions };
    }
    const pid = Number(productId);
    const fws = allFrameworks.filter((f) => f.product_id === pid);
    const fwIds = new Set(fws.map((f) => f.id));
    const ctrlIds = new Set(allControls.filter((c) => fwIds.has(c.framework_id)).map((c) => c.id));
    const evs = allEvidence.filter((e) => ctrlIds.has(e.control_id));
    const evIds = new Set(evs.map((e) => e.id));
    const subs = allSubmissions.filter((s) => evIds.has(s.evidence_id));
    return { frameworks: fws, evidence: evs, submissions: subs };
  }, [productId, allFrameworks, allControls, allEvidence, allSubmissions]);

  const stats = [
    {
      label: "Total Evidence",
      value: evidence.length,
      icon: <DocumentIcon size={26} />,
      bg: "rgba(255,115,0,0.08)",
      iconColor: "#FF7300",
    },
    {
      label: "Total Submissions",
      value: submissions.length,
      icon: <EnvelopeIcon size={26} />,
      bg: "rgba(46,125,250,0.08)",
      iconColor: "#2E7DFA",
    },
    {
      label: "Frameworks",
      value: frameworks.length,
      icon: <HierarchyIcon size={26} />,
      bg: "rgba(34,197,94,0.08)",
      iconColor: "#22C55E",
    },
    {
      label: "Pending Reviews",
      value: submissions.filter((s) => s.status === "pending").length,
      icon: <ClockAsteriskIcon size={26} />,
      bg: "rgba(234,179,8,0.10)",
      iconColor: "#EAB308",
    },
  ];

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Overview of evidence, submissions, and pending reviews
            {productId !== "" ? ` for "${products.find((p) => p.id === Number(productId))?.name ?? "selected product"}"` : " across all products"}.
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Product</InputLabel>
          <Select
            label="Product"
            value={productId}
            onChange={(e) => setProductId(e.target.value as number | "")}
          >
            <MenuItem value="">All Products</MenuItem>
            {products.map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Grid container spacing={2.5} sx={{ mt: 2, mb: 5 }}>
        {stats.map(({ label, value, icon, bg, iconColor }) => (
          <Grid item xs={12} sm={6} md={3} key={label}>
            <Card>
              <CardContent sx={{ py: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      backgroundColor: bg,
                      color: iconColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {icon}
                  </Box>
                  <Box>
                    <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.1 }}>
                      {value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mt={0.25}>
                      {label}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h6" gutterBottom>
        Recent Submissions
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Submitted By</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Date</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {submissions.slice(0, 5).map((s) => (
              <TableRow key={s.id} hover>
                <TableCell>{s.id}</TableCell>
                <TableCell>{s.submitted_by}</TableCell>
                <TableCell>
                  <Chip label={s.status} color={statusColor(s.status)} size="small" />
                </TableCell>
                <TableCell>{new Date(s.submitted_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {submissions.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ color: "text.disabled", py: 5 }}>
                  No submissions yet{productId !== "" ? " for this product" : ""}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
