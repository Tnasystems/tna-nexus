"use client";

import { Bell, BriefcaseBusiness, ClipboardCheck, FileText, HardHat, LayoutDashboard, LogOut, Shield, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "./brand-logo";
import { clearSession, type AppSession } from "../lib/auth";

const nav = [
  { label: "Overview", icon: LayoutDashboard, href: "#overview" },
  { label: "Jobs", icon: BriefcaseBusiness, href: "#jobs" },
  { label: "Staff", icon: Users, href: "#staff" },
  { label: "Forms", icon: ClipboardCheck, href: "#forms" },
  { label: "Documents", icon: FileText, href: "#documents" },
  { label: "Compliance", icon: HardHat, href: "#compliance" },
  { label: "Notifications", icon: Bell, href: "#notifications" }
];

export function DashboardShell({ children, session }: Readonly<{ children: React.ReactNode; session: AppSession }>) {
  const router = useRouter();

  function handleLogout() {
    clearSession();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main>
      <div className="shell">
        <aside className="panel" style={{ padding: 24, position: "sticky", top: 24, alignSelf: "start" }}>
          <BrandLogo />
          <div className="panel stack" style={{ marginTop: 24, padding: 18, borderRadius: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Shield size={18} color="var(--accent)" />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{session.user.email}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {session.user.role.replaceAll("_", " ").toLowerCase()}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="badge" href="/">Home</Link>
              <a className="badge" href="/api/docs" rel="noreferrer" target="_blank">Swagger</a>
            </div>
          </div>
          <div className="stack" style={{ marginTop: 28 }}>
            {nav.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 18,
                  border: "1px solid var(--line)",
                  background: "rgba(255,255,255,0.02)"
                }}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
          <button className="button button-subtle" onClick={handleLogout} style={{ marginTop: 24, width: "100%" }} type="button">
            <LogOut size={16} />
            Sign Out
          </button>
        </aside>
        <section className="stack">{children}</section>
      </div>
    </main>
  );
}
