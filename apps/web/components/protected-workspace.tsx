"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readSession, type AppSession } from "../lib/auth";
import { WorkspaceShell } from "./workspace-shell";

function operativeAllowedPath(pathname: string) {
  return pathname === "/dashboard/calendar" ||
    pathname === "/dashboard/jobs" ||
    pathname.startsWith("/dashboard/jobs/");
}

export function ProtectedWorkspace({
  children,
  title,
  description,
  allow
}: Readonly<{
  children: (session: AppSession) => React.ReactNode;
  title: string;
  description: string;
  allow: "admin" | "tenant";
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);

  useEffect(() => {
    const nextSession = readSession();
    if (!nextSession) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    const isSupportSession = nextSession.user.role === "PLATFORM_ADMIN" && !!nextSession.user.companyId && !!nextSession.user.tenantSlug;

    if (allow === "admin" && nextSession.user.role !== "PLATFORM_ADMIN") {
      router.replace("/dashboard");
      return;
    }

    if (allow === "tenant" && nextSession.user.role === "PLATFORM_ADMIN" && !isSupportSession) {
      router.replace("/dashboard/admin");
      return;
    }

    if (allow === "tenant" && nextSession.user.role === "OPERATIVE" && !operativeAllowedPath(pathname)) {
      router.replace("/dashboard/calendar");
      return;
    }

    setSession(nextSession);
  }, [allow, pathname, router]);

  if (!session) {
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
    <WorkspaceShell description={description} session={session} title={title}>
      {children(session)}
    </WorkspaceShell>
  );
}
