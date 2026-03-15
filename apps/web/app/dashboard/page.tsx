import { DashboardShell } from "../../components/dashboard-shell";
import { forms, jobs, overviewMetrics, staff } from "../../lib/demo-data";

export default function DashboardPage() {
  return (
    <DashboardShell>
      <section className="panel" style={{ padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div className="badge">Operations cockpit</div>
            <h1 style={{ margin: "14px 0 8px", fontSize: 34 }}>Demo company workspace</h1>
            <p className="muted" style={{ margin: 0 }}>Original dashboard layout for scheduling, compliance, forms, and workforce visibility.</p>
          </div>
          <button className="button">Create Job</button>
        </div>
      </section>

      <section className="metric-grid">
        {overviewMetrics.map((metric) => (
          <article key={metric.label} className="panel" style={{ padding: 22 }}>
            <div className="muted">{metric.label}</div>
            <div style={{ marginTop: 10, fontSize: 34, fontWeight: 800 }}>{metric.value}</div>
            <div className="badge" style={{ marginTop: 12 }}>{metric.trend}</div>
          </article>
        ))}
      </section>

      <section id="jobs" className="panel" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Live Jobs</h2>
          <span className="muted">Field-friendly scheduling board</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Site</th>
              <th>Status</th>
              <th>Lead</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.title}>
                <td>{job.title}</td>
                <td>{job.site}</td>
                <td><span className="badge">{job.status}</span></td>
                <td>{job.tech}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <article id="staff" className="panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Staff Status</h2>
          <div className="stack">
            {staff.map((person) => (
              <div key={person.name} style={{ display: "flex", justifyContent: "space-between", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{person.name}</div>
                  <div className="muted">{person.role}</div>
                </div>
                <span className="badge">{person.state}</span>
              </div>
            ))}
          </div>
        </article>
        <article id="forms" className="panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Reusable Form Schemas</h2>
          <div className="stack">
            {forms.map((form) => (
              <div key={form.name} style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontWeight: 700 }}>{form.name}</div>
                <div className="muted">{form.version} • {form.usage}</div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </DashboardShell>
  );
}
