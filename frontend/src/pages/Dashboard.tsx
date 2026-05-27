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
import { DocumentIcon, EnvelopeIcon, HierarchyIcon, ClockAsteriskIcon } from "@oxygen-ui/react-icons";
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
      value: submissions.filter((s: any) => s.status === "pending").length,
      icon: <ClockAsteriskIcon size={26} />,
      bg: "rgba(234,179,8,0.10)",
      iconColor: "#EAB308",
    },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Overview of evidence, submissions, and pending reviews across all frameworks.
      </Typography>

      <Grid container spacing={2.5} sx={{ mb: 5 }}>
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
                <TableCell colSpan={4} align="center" sx={{ color: "text.disabled", py: 5 }}>
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
