import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { frameworksApi, controlsApi, evidenceApi } from "../api/client";

export default function SubmitEvidence() {
  const [frameworkId, setFrameworkId] = useState<number | undefined>();
  const [controlId, setControlId] = useState<number | undefined>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [success, setSuccess] = useState(false);

  const { data: frameworks = [] } = useQuery({
    queryKey: ["frameworks"],
    queryFn: frameworksApi.list,
  });
  const { data: controls = [] } = useQuery({
    queryKey: ["controls", frameworkId],
    queryFn: () => controlsApi.list(frameworkId),
    enabled: !!frameworkId,
  });

  const mutation = useMutation({
    mutationFn: evidenceApi.create,
    onSuccess: () => {
      setSuccess(true);
      setTitle("");
      setDescription("");
      setFile(null);
      setControlId(undefined);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !controlId) return;
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("control_id", String(controlId));
    formData.append("file", file);
    mutation.mutate(formData);
  };

  return (
    <div className="page">
      <h1>Submit Evidence</h1>

      {success && (
        <div className="alert alert-success">Evidence submitted successfully.</div>
      )}

      <form className="form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Framework</label>
          <select
            value={frameworkId ?? ""}
            onChange={(e) => { setFrameworkId(Number(e.target.value)); setControlId(undefined); }}
            required
          >
            <option value="">Select framework</option>
            {frameworks.map((f: any) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Control</label>
          <select
            value={controlId ?? ""}
            onChange={(e) => setControlId(Number(e.target.value))}
            disabled={!frameworkId}
            required
          >
            <option value="">Select control</option>
            {controls.map((c: any) => (
              <option key={c.id} value={c.id}>{c.control_ref} — {c.title}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Evidence title"
            required
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>File</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Uploading..." : "Submit Evidence"}
        </button>
      </form>
    </div>
  );
}
