import { useQuery } from "@tanstack/react-query";
import { evidenceApi, submissionsApi, frameworksApi } from "../api/client";

export default function Dashboard() {
  const { data: evidence = [] } = useQuery({ queryKey: ["evidence"], queryFn: evidenceApi.list });
  const { data: submissions = [] } = useQuery({ queryKey: ["submissions"], queryFn: submissionsApi.list });
  const { data: frameworks = [] } = useQuery({ queryKey: ["frameworks"], queryFn: frameworksApi.list });

  return (
    <div className="page">
      <h1>Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{evidence.length}</div>
          <div className="stat-label">Total Evidence</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{submissions.length}</div>
          <div className="stat-label">Total Submissions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{frameworks.length}</div>
          <div className="stat-label">Frameworks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {submissions.filter((s: any) => s.status === "pending").length}
          </div>
          <div className="stat-label">Pending Reviews</div>
        </div>
      </div>

      <h2>Recent Submissions</h2>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Submitted By</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {submissions.slice(0, 5).map((s: any) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.submitted_by}</td>
              <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
              <td>{new Date(s.submitted_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {submissions.length === 0 && (
            <tr><td colSpan={4} className="empty">No submissions yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
