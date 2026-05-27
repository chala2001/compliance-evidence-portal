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
import { evidenceApi, submissionsApi, frameworksApi } from "../api/client";

const statusColor = (status: string): "warning" | "success" | "error" | "default" => {
  if (status === "pending") return "warning";
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  return "default";
};

export default function Dashboard() {
  const { data: evidence = [] } = useQuery({ queryKey: ["evidence"], queryFn: evidenceApi.list });
  const { data: submissions = [] } = useQuery({ queryKey: ["submissions"], queryFn: submissionsApi.list });
  const { data: frameworks = [] } = useQuery({ queryKey: ["frameworks"], queryFn: frameworksApi.list });

  const stats = [
    { label: "Total Evidence", value: evidence.length },
    { label: "Total Submissions", value: submissions.length },
    { label: "Frameworks", value: frameworks.length },
    { label: "Pending Reviews", value: submissions.filter((s: any) => s.status === "pending").length },
  ];

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Dashboard
      </Typography>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {stats.map(({ label, value }) => (
          <Grid item xs={12} sm={6} md={3} key={label}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h3" fontWeight={700} color="primary">
                  {value}
                </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  {label}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h6" fontWeight={600} gutterBottom>
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
            {submissions.slice(0, 5).map((s: any) => (
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
                <TableCell colSpan={4} align="center" sx={{ color: "text.disabled", py: 3 }}>
                  No submissions yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
