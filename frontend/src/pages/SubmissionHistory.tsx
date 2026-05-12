import { useQuery } from "@tanstack/react-query";
import { submissionsApi } from "../api/client";

export default function SubmissionHistory() {
  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["submissions"],
    queryFn: submissionsApi.list,
  });

  return (
    <div className="page">
      <h1>Submission History</h1>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Evidence ID</th>
              <th>Submitted By</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s: any) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.evidence_id}</td>
                <td>{s.submitted_by}</td>
                <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                <td>{s.notes ?? "—"}</td>
                <td>{new Date(s.submitted_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {submissions.length === 0 && (
              <tr><td colSpan={6} className="empty">No submissions yet</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
