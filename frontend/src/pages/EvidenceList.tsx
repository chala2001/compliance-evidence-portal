import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { evidenceApi, frameworksApi, controlsApi } from "../api/client";

export default function EvidenceList() {
  const queryClient = useQueryClient();
  const [selectedFramework, setSelectedFramework] = useState<number | undefined>();

  const { data: evidence = [], isLoading } = useQuery({
    queryKey: ["evidence"],
    queryFn: evidenceApi.list,
  });
  const { data: frameworks = [] } = useQuery({
    queryKey: ["frameworks"],
    queryFn: frameworksApi.list,
  });
  const { data: controls = [] } = useQuery({
    queryKey: ["controls", selectedFramework],
    queryFn: () => controlsApi.list(selectedFramework),
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
    <div className="page">
      <h1>Evidence</h1>

      <div className="filters">
        <select
          value={selectedFramework ?? ""}
          onChange={(e) => setSelectedFramework(e.target.value ? Number(e.target.value) : undefined)}
        >
          <option value="">All Frameworks</option>
          {frameworks.map((f: any) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>File</th>
              <th>Control</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((e: any) => (
              <tr key={e.id}>
                <td>{e.title}</td>
                <td>
                  <a href={`http://localhost:8000${e.file_url}`} target="_blank" rel="noreferrer">
                    {e.file_name}
                  </a>
                </td>
                <td>{getControlRef(e.control_id)}</td>
                <td>{new Date(e.created_at).toLocaleDateString()}</td>
                <td>
                  <button
                    className="btn btn-danger"
                    onClick={() => deleteMutation.mutate(e.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {evidence.length === 0 && (
              <tr><td colSpan={5} className="empty">No evidence found</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
