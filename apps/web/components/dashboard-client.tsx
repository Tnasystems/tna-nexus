"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "./dashboard-shell";
import { compliance, documents, forms, jobs, notifications, overviewMetrics, staff } from "../lib/demo-data";
import type { AppSession } from "../lib/auth";
import { readSession } from "../lib/auth";

export function DashboardClient() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const nextSession = readSession();

    if (!nextSession) {
      router.replace("/login?redirect=/dashboard");
      return;
    }

    setSession(nextSession);
    setReady(true);
  }, [router]);

  if (!ready || !session) {
    return (
      <main style={{ padding: "24px 0 48px" }}>
        <section className="panel" style={{ padding: 28 }}>
          <div className="badge">Checking session</div>
          <h1 style={{ marginBottom: 0 }}>Loading your workspace...</h1>
        </section>
      </main>
    );
  }

  return (
    <DashboardShell session={session}>
      <section id="overview" className="panel" style={{ padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div className="badge">Operations cockpit</div>
            <h1 style={{ margin: "14px 0 8px", fontSize: 34 }}>
              {session.user.tenantSlug ? `${session.user.tenantSlug} workspace` : "Platform admin workspace"}
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              Signed in as {session.user.email} with {session.user.role.replaceAll("_", " ").toLowerCase()} access.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a className="badge" href="/api/docs" rel="noreferrer" target="_blank">Open API docs</a>
            <button className="button" type="button">Create Job</button>
          </div>
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
                <div className="muted">{form.version} - {form.usage}</div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <article id="documents" className="panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Documents</h2>
          <div className="stack">
            {documents.map((document) => (
              <div key={document.name} style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontWeight: 700 }}>{document.name}</div>
                <div className="muted">{document.type} - {document.status}</div>
              </div>
            ))}
          </div>
        </article>
        <article id="compliance" className="panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Compliance Watchlist</h2>
          <div className="stack">
            {compliance.map((item) => (
              <div key={item.title} style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <div className="muted">{item.status} - {item.priority}</div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section id="notifications" className="panel" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Notifications</h2>
          <span className="muted">Live operational activity feed</span>
        </div>
        <div className="stack">
          {notifications.map((item) => (
            <div key={item.title} style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <div className="muted">{item.channel}</div>
              </div>
              <span className="badge">{item.time}</span>
            </div>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
