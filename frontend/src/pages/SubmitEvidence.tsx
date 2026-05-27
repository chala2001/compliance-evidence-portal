import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import { frameworksApi, controlsApi, evidenceApi } from "../api/client";

export default function SubmitEvidence() {
  const [frameworkId, setFrameworkId] = useState<number | "">("");
  const [controlId, setControlId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [success, setSuccess] = useState(false);

  const { data: frameworks = [] } = useQuery({
    queryKey: ["frameworks"],
    queryFn: frameworksApi.list,
  });
  const { data: controls = [] } = useQuery({
    queryKey: ["controls", frameworkId || undefined],
    queryFn: () => controlsApi.list(frameworkId || undefined),
    enabled: !!frameworkId,
  });

  const mutation = useMutation({
    mutationFn: evidenceApi.create,
    onSuccess: () => {
      setSuccess(true);
      setTitle("");
      setDescription("");
      setFile(null);
      setFrameworkId("");
      setControlId("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !controlId) return;
    setSuccess(false);
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("control_id", String(controlId));
    formData.append("file", file);
    mutation.mutate(formData);
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Submit Evidence
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Upload a file and link it to a compliance control.
      </Typography>

      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Evidence submitted successfully.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 3, maxWidth: 560 }}>
        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2.5}>
            <FormControl fullWidth required>
              <InputLabel>Framework</InputLabel>
              <Select
                label="Framework"
                value={frameworkId}
                onChange={(e) => { setFrameworkId(e.target.value as number); setControlId(""); }}
              >
                {frameworks.map((f: any) => (
                  <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth required disabled={!frameworkId}>
              <InputLabel>Control</InputLabel>
              <Select
                label="Control"
                value={controlId}
                onChange={(e) => setControlId(e.target.value as number)}
              >
                {controls.map((c: any) => (
                  <MenuItem key={c.id} value={c.id}>{c.control_ref} — {c.title}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Evidence title"
              required
              fullWidth
            />

            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              multiline
              rows={3}
              fullWidth
            />

            <Box>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                File *
              </Typography>
              <input
                type="file"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                style={{ width: "100%" }}
              />
            </Box>

            <Button
              type="submit"
              variant="contained"
              disabled={mutation.isPending}
              size="large"
            >
              {mutation.isPending ? "Uploading..." : "Submit Evidence"}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
