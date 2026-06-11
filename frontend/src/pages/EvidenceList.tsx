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
import { DocumentIcon, TrashIcon } from "@oxygen-ui/react-icons";
import { evidenceApi, frameworksApi, controlsApi, productsApi } from "../api/client";

type Product = { id: number; name: string };
type Framework = { id: number; name: string; product_id: number };
type Control = { id: number; framework_id: number; control_ref: string };
type Evidence = {
  id: number;
  title: string;
  file_name: string;
  file_url: string;
  control_id: number;
  created_at: string;
};

export default function EvidenceList() {
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState<number | "">("");
  const [frameworkId, setFrameworkId] = useState<number | "">("");

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["evidence"] }),
  });

  const controlIndex = useMemo(() => {
    const m = new Map<number, Control>();
    allControls.forEach((c) => m.set(c.id, c));
    return m;
  }, [allControls]);

  const frameworkIndex = useMemo(() => {
    const m = new Map<number, Framework>();
    allFrameworks.forEach((f) => m.set(f.id, f));
    return m;
  }, [allFrameworks]);

  const visibleFrameworks = useMemo(
    () =>
      productId === ""
        ? allFrameworks
        : allFrameworks.filter((f) => f.product_id === Number(productId)),
    [allFrameworks, productId]
  );

  const filteredEvidence = useMemo(() => {
    return evidence.filter((e) => {
      const ctrl = controlIndex.get(e.control_id);
      if (!ctrl) return false;
      const fw = frameworkIndex.get(ctrl.framework_id);
      if (!fw) return false;
      if (productId !== "" && fw.product_id !== Number(productId)) return false;
      if (frameworkId !== "" && fw.id !== Number(frameworkId)) return false;
      return true;
    });
  }, [evidence, controlIndex, frameworkIndex, productId, frameworkId]);

  const getControlRef = (controlId: number) => controlIndex.get(controlId)?.control_ref ?? controlId;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Evidence
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Files captured manually or via the AI agent, linked to compliance controls.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
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
                <TableCell>Title</TableCell>
                <TableCell>File</TableCell>
                <TableCell>Control</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredEvidence.map((e) => (
                <TableRow key={e.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{e.title}</TableCell>
                  <TableCell>
                    <Link
                      href={`http://localhost:8000${e.file_url}`}
                      target="_blank"
                      rel="noreferrer"
                      underline="hover"
                      sx={{ fontFamily: "monospace", fontSize: "0.82rem" }}
                    >
                      {e.file_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Chip label={getControlRef(e.control_id)} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>
                    {new Date(e.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      color="error"
                      variant="text"
                      startIcon={<TrashIcon size={16} />}
                      onClick={() => deleteMutation.mutate(e.id)}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredEvidence.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                    <Stack alignItems="center" spacing={1}>
                      <Box sx={{ color: "text.disabled" }}>
                        <DocumentIcon size={48} />
                      </Box>
                      <Typography color="text.secondary">
                        {evidence.length === 0 ? "No evidence found" : "No evidence matches the current filters"}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {evidence.length === 0
                          ? "Upload via Submit or run the AI agent."
                          : "Try clearing the filters above."}
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
