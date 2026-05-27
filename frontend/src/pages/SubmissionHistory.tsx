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
import { ClockAsteriskIcon } from "@oxygen-ui/react-icons";
import { submissionsApi } from "../api/client";

const statusColor = (status: string): "warning" | "success" | "error" | "default" => {
  if (status === "pending") return "warning";
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  return "default";
};

export default function SubmissionHistory() {
  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["submissions"],
    queryFn: submissionsApi.list,
  });

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Submission History
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Complete audit trail of evidence submissions with reviewer notes.
      </Typography>

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
              {submissions.map((s: any) => (
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
              {submissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                    <Stack alignItems="center" spacing={1}>
                      <Box sx={{ color: "text.disabled" }}>
                        <ClockAsteriskIcon size={48} />
                      </Box>
                      <Typography color="text.secondary">No submissions yet</Typography>
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
