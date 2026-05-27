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
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Submission History
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
                <TableCell>Notes</TableCell>
                <TableCell>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {submissions.map((s: any) => (
                <TableRow key={s.id} hover>
                  <TableCell>{s.id}</TableCell>
                  <TableCell>{s.evidence_id}</TableCell>
                  <TableCell>{s.submitted_by}</TableCell>
                  <TableCell>
                    <Chip label={s.status} color={statusColor(s.status)} size="small" />
                  </TableCell>
                  <TableCell>{s.notes ?? "—"}</TableCell>
                  <TableCell>{new Date(s.submitted_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {submissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: "text.disabled", py: 3 }}>
                    No submissions yet
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
