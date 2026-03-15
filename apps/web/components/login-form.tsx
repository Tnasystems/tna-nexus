"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { login } from "../lib/auth";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const session = await login({ email, password });
      const redirectTo = session.user.role === "PLATFORM_ADMIN"
        ? "/dashboard/admin"
        : (typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("redirect") || "/dashboard"
          : "/dashboard");

      router.replace(redirectTo);
      router.refresh();
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError.message : "Login failed.";
      setError(nextError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main style={{ padding: "40px 0 64px" }}>
      <section className="auth-grid">
        <article className="panel stack" style={{ padding: 28 }}>
          <div className="badge">Secure access</div>
          <h1 style={{ margin: 0, fontSize: "clamp(34px, 5vw, 58px)", lineHeight: 0.95 }}>
            Sign in to
            <br />
            TNA-Nexus
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>
            Use your platform admin or company credentials. The system routes company users automatically.
          </p>
          <div className="stack">
            <div className="callout">
              <ShieldCheck size={18} />
              <span>Platform admins go straight to the control workspace after sign in.</span>
            </div>
            <div className="callout">
              <LockKeyhole size={18} />
              <span>Company users are matched to the correct tenant database by their email address.</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="badge" href="/">
              Back to overview
            </Link>
            <Link className="button button-subtle" href="/dashboard">
              View dashboard
              <ArrowRight size={16} />
            </Link>
          </div>
        </article>

        <article className="panel" style={{ padding: 28 }}>
          <form className="stack" onSubmit={handleSubmit}>
            <div>
              <div className="muted" style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1.2 }}>
                Account login
              </div>
              <h2 style={{ margin: "10px 0 0", fontSize: 28 }}>Access your workspace</h2>
            </div>

            <label className="field">
              <span>Email address</span>
              <input
                autoComplete="email"
                className="input"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@your-domain.com"
                required
                type="email"
                value={email}
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                autoComplete="current-password"
                className="input"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type="password"
                value={password}
              />
            </label>

            {error ? <div className="error-banner">{error}</div> : null}

            <button className="button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Signing in..." : "Sign In"}
              <ArrowRight size={16} />
            </button>
          </form>
        </article>
      </section>
    </main>
  );
}
