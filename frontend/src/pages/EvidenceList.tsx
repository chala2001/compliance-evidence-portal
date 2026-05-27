import { useState } from "react";
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
import { evidenceApi, frameworksApi, controlsApi } from "../api/client";

export default function EvidenceList() {
  const queryClient = useQueryClient();
  const [selectedFramework, setSelectedFramework] = useState<number | "">("");

  const { data: evidence = [], isLoading } = useQuery({
    queryKey: ["evidence"],
    queryFn: evidenceApi.list,
  });
  const { data: frameworks = [] } = useQuery({
    queryKey: ["frameworks"],
    queryFn: frameworksApi.list,
  });
  const { data: controls = [] } = useQuery({
    queryKey: ["controls", selectedFramework || undefined],
    queryFn: () => controlsApi.list(selectedFramework || undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: evidenceApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["evidence"] }),
  });

  const getControlRef = (controlId: number) => {
    const control = controls.find((c: any) => c.id === controlId);
    return control ? control.control_ref : controlId;
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Evidence
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Files captured manually or via the AI agent, linked to compliance controls.
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Framework</InputLabel>
          <Select
            label="Framework"
            value={selectedFramework}
            onChange={(e) => setSelectedFramework(e.target.value as number | "")}
          >
            <MenuItem value="">All Frameworks</MenuItem>
            {frameworks.map((f: any) => (
              <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
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
              {evidence.map((e: any) => (
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
              {evidence.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                    <Stack alignItems="center" spacing={1}>
                      <Box sx={{ color: "text.disabled" }}>
                        <DocumentIcon size={48} />
                      </Box>
                      <Typography color="text.secondary">No evidence found</Typography>
                      <Typography variant="caption" color="text.disabled">
                        Upload via Submit or run the AI agent.
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
