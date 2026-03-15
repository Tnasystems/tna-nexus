import { Bell, BriefcaseBusiness, ClipboardCheck, FileText, HardHat, LayoutDashboard, Users } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";

const nav = [
  { label: "Overview", icon: LayoutDashboard, href: "#" },
  { label: "Jobs", icon: BriefcaseBusiness, href: "#jobs" },
  { label: "Staff", icon: Users, href: "#staff" },
  { label: "Forms", icon: ClipboardCheck, href: "#forms" },
  { label: "Documents", icon: FileText, href: "#documents" },
  { label: "Compliance", icon: HardHat, href: "#compliance" },
  { label: "Notifications", icon: Bell, href: "#notifications" }
];

export function DashboardShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main>
      <div className="shell">
        <aside className="panel" style={{ padding: 24, position: "sticky", top: 24, alignSelf: "start" }}>
          <BrandLogo />
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
        </aside>
        <section className="stack">{children}</section>
      </div>
    </main>
  );
}
