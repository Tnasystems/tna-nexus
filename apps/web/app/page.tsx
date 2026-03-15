import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck, Smartphone, Workflow } from "lucide-react";
import { BrandLogo } from "../components/brand-logo";

const pillars = [
  {
    title: "Office + field workflows",
    text: "Manage jobs, staff, forms, assets, compliance, and documents from one API-first platform."
  },
  {
    title: "Per-company database isolation",
    text: "Every company gets a dedicated PostgreSQL database with server-side tenant routing and provisioning."
  },
  {
    title: "Ready for future mobile apps",
    text: "JWT + refresh tokens, versioned APIs, schema-driven forms, queued uploads, and notification hooks are built in."
  }
];

export default function HomePage() {
  return (
    <main style={{ padding: "24px 0 64px" }}>
      <section className="panel" style={{ padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <BrandLogo />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="badge" href="/login">Secure sign in</Link>
            <a className="badge" href="/api/docs">Open API docs</a>
            <Link className="button" href="/dashboard">
              Launch Dashboard
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <div style={{ marginTop: 36, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 24 }}>
          <div className="stack">
            <div className="badge">Original industrial-tech SaaS identity</div>
            <h1 style={{ margin: 0, fontSize: "clamp(38px, 6vw, 72px)", lineHeight: 0.96 }}>
              Control jobs,
              <br />
              workforce, and compliance without splitting office and field operations.
            </h1>
            <p className="muted" style={{ fontSize: 18, maxWidth: 720 }}>
              TNA-Nexus is a production-ready multi-tenant platform starter for service businesses that need strict data
              isolation, auditable workflows, and a backend that can power both web and native mobile apps later.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link className="button" href="/login">
                Sign In
                <ArrowRight size={16} />
              </Link>
              <a className="button button-subtle" href="/api/docs">Explore API</a>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span className="badge"><Workflow size={14} /> Jobs, tasks, forms, timesheets</span>
              <span className="badge"><ShieldCheck size={14} /> Tenant-safe provisioning</span>
              <span className="badge"><Smartphone size={14} /> Mobile-ready API</span>
            </div>
          </div>
          <div className="panel" style={{ padding: 24, background: "linear-gradient(180deg, rgba(255,122,26,0.16), rgba(19,37,58,0.92))" }}>
            <div className="stack">
              <div>
                <div className="muted" style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1.2 }}>Live Ops Snapshot</div>
                <div style={{ marginTop: 12, fontSize: 32, fontWeight: 800 }}>94.2%</div>
                <div className="muted">scheduled jobs on target this week</div>
              </div>
              {["Dedicated tenant database", "Versioned API with Swagger", "Documented offline sync strategy"].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, border: "1px solid var(--line)", borderRadius: 18 }}>
                  <CheckCircle2 size={18} color="var(--ok)" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 24 }} className="metric-grid">
        {pillars.map((pillar) => (
          <article key={pillar.title} className="panel" style={{ padding: 22 }}>
            <div className="badge">{pillar.title}</div>
            <p style={{ margin: "18px 0 0", lineHeight: 1.6 }}>{pillar.text}</p>
          </article>
        ))}
      </section>

      <section className="panel" style={{ padding: 24, marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div className="badge">Access flow</div>
            <h2 style={{ marginBottom: 8 }}>Platform admins and tenant users can now sign in from the web app</h2>
            <p className="muted" style={{ margin: 0 }}>
              Platform admins log in with just email and password. Tenant users add their company slug to reach the correct workspace.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="badge" href="/login">Open login</Link>
            <Link className="badge" href="/dashboard">Open protected dashboard</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
