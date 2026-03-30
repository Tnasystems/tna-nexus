"use client";

import { Banknote, Bell, BriefcaseBusiness, Building2, CalendarDays, ClipboardCheck, FileBarChart2, FileText, Home, LogOut, Shield, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "./brand-logo";
import { clearSession, type AppSession } from "../lib/auth";

const tenantNav = [
  { label: "Overview", href: "/dashboard", icon: Home },
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Jobs", href: "/dashboard/jobs", icon: BriefcaseBusiness },
  { label: "Team", href: "/dashboard/users", icon: Users },
  { label: "Vehicles", href: "/dashboard/vehicles", icon: Wrench },
  { label: "Rates", href: "/dashboard/rates", icon: Banknote },
  { label: "Forms", href: "/dashboard/forms", icon: ClipboardCheck },
  { label: "Assets", href: "/dashboard/assets", icon: Wrench },
  { label: "Documents", href: "/dashboard/documents", icon: FileText },
  { label: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { label: "Reporting", href: "/dashboard/reporting", icon: FileBarChart2 }
];

const operativeNav = [
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Jobs", href: "/dashboard/jobs", icon: BriefcaseBusiness }
];

const adminNav = [
  { label: "Admin Home", href: "/dashboard/admin", icon: Shield },
  { label: "Companies", href: "/dashboard/admin", icon: Building2 }
];

export function WorkspaceShell({
  children,
  session,
  title,
  description
}: Readonly<{
  children: React.ReactNode;
  session: AppSession;
  title: string;
  description: string;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const isSupportSession = session.user.role === "PLATFORM_ADMIN" && !!session.user.companyId && !!session.user.tenantSlug;
  const isOperative = session.user.role === "OPERATIVE";
  const nav = session.user.role === "PLATFORM_ADMIN" && !isSupportSession
    ? adminNav
    : isOperative
      ? operativeNav
      : tenantNav;

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
          {!isOperative ? (
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
                {isSupportSession ? <Link className="badge" href="/dashboard/admin">Back to Admin</Link> : null}
              </div>
            </div>
          ) : null}
          <div className="stack" style={{ marginTop: 28 }}>
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 18,
                    border: "1px solid var(--line)",
                    background: active ? "rgba(255,122,26,0.12)" : "rgba(255,255,255,0.02)",
                    color: active ? "var(--accent)" : "var(--text)"
                  }}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
          <button className="button button-subtle" onClick={handleLogout} style={{ marginTop: 24, width: "100%" }} type="button">
            <LogOut size={16} />
            Sign Out
          </button>
        </aside>

        <section className="stack">
          <section className="panel" style={{ padding: 28 }}>
            <div className="badge">{session.user.role === "PLATFORM_ADMIN" && !isSupportSession ? "Platform control" : "Company workspace"}</div>
            <h1 style={{ margin: "14px 0 8px", fontSize: 34 }}>{title}</h1>
            <p className="muted" style={{ margin: 0 }}>{description}</p>
          </section>
          {children}
        </section>
      </div>
    </main>
  );
}
