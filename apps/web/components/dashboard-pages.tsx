"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedWorkspace } from "./protected-workspace";
import { apiRequest } from "../lib/api";
import { buildSession, persistSession, type AppSession, type AuthTokenResponse } from "../lib/auth";
import { JOB_STATUS_VALUES, ROLE_VALUES } from "@tna-nexus/shared";

function PanelGrid({ children }: Readonly<{ children: React.ReactNode }>) {
  return <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>{children}</section>;
}

function ErrorText({ error }: Readonly<{ error: string | null }>) {
  return error ? <div className="error-banner">{error}</div> : null;
}

function TextField({
  label,
  value,
  onChange,
  type = "text"
}: Readonly<{ label: string; value: string; onChange: (value: string) => void; type?: string }>) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange
}: Readonly<{ label: string; value: string; onChange: (value: string) => void }>) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea className="input" onChange={(event) => onChange(event.target.value)} rows={6} value={value} />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: Readonly<{ label: string; value: string; onChange: (value: string) => void; options: string[] }>) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="input" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

interface CompanySummary {
  company: { name: string; slug: string };
  metrics: { users: number; jobs: number; assets: number };
}

interface ReportingSummary {
  jobs: number;
  completedJobs: number;
  scheduledJobs: number;
  activeUsers: number;
}

interface NotificationRecord {
  id: string;
  title: string;
  channel: string;
  status: string;
}

interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

interface JobRecord {
  id: string;
  title: string;
  companyJobNumber: string;
  customerJobNumber: string;
  siteAddress: string;
  status: string;
  scheduledFor: string | null;
  scheduledTo: string | null;
  scheduledDays: string[];
  dailyAssignmentsJson: string;
  assignedOperativeIds: string[];
}

const MANAGER_ROLES = new Set(["PLATFORM_ADMIN", "DIRECTOR", "MANAGER"]);

function toDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseDailyAssignments(value: string | null | undefined) {
  if (!value) {
    return {} as Record<string, string[]>;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([day, users]) => [
        day,
        Array.isArray(users) ? users.filter((entry): entry is string => typeof entry === "string") : []
      ])
    ) as Record<string, string[]>;
  } catch {
    return {} as Record<string, string[]>;
  }
}

function getJobDailyAssignments(job: JobRecord) {
  const parsed = parseDailyAssignments(job.dailyAssignmentsJson);
  if (Object.keys(parsed).length > 0) {
    return parsed;
  }

  return Object.fromEntries(
    (job.scheduledDays ?? []).map((day) => [day, job.assignedOperativeIds ?? []])
  ) as Record<string, string[]>;
}

function getAssignedUsersForDay(job: JobRecord, day: string) {
  return getJobDailyAssignments(job)[day] ?? [];
}

function startOfWeek(day: Date) {
  const next = new Date(day);
  const offset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - offset);
  next.setHours(0, 0, 0, 0);
  return next;
}

function shiftDateKey(dateKey: string, days: number) {
  const next = new Date(`${dateKey}T00:00:00`);
  next.setDate(next.getDate() + days);
  return toDateKey(next);
}

function getJobChipStyle(status: string) {
  if (status === "COMPLETED") {
    return { background: "rgba(52, 211, 153, 0.22)", borderColor: "rgba(52, 211, 153, 0.45)", color: "#d8fff0" };
  }

  if (status === "IN_PROGRESS") {
    return { background: "rgba(251, 191, 36, 0.22)", borderColor: "rgba(251, 191, 36, 0.45)", color: "#fff0c2" };
  }

  return { background: "rgba(96, 165, 250, 0.24)", borderColor: "rgba(96, 165, 250, 0.42)", color: "#deebff" };
}

function useJobsAndUsers() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [nextJobs, nextUsers] = await Promise.all([
        apiRequest<JobRecord[]>("jobs"),
        apiRequest<UserRecord[]>("users")
      ]);
      setJobs(nextJobs);
      setUsers(nextUsers);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load jobs.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return { jobs, users, error, setError, reload: load };
}

export function TenantOverviewPage() {
  const [data, setData] = useState<{
    company?: CompanySummary;
    reporting?: ReportingSummary;
    notifications?: NotificationRecord[];
  }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiRequest<CompanySummary>("companies/me"),
      apiRequest<ReportingSummary>("reporting/summary"),
      apiRequest<NotificationRecord[]>("notifications")
    ])
      .then(([company, reporting, notifications]) => setData({ company, reporting, notifications }))
      .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "Failed to load dashboard."));
  }, []);

  return (
    <ProtectedWorkspace allow="tenant" description="Live company metrics, alerts, and operational status." title="Operations Overview">
      {() => (
        <>
          <ErrorText error={error} />
          <section className="metric-grid">
            {[
              { label: "Users", value: data.company?.metrics.users ?? 0 },
              { label: "Jobs", value: data.reporting?.jobs ?? 0 },
              { label: "Completed Jobs", value: data.reporting?.completedJobs ?? 0 },
              { label: "Active Users", value: data.reporting?.activeUsers ?? 0 }
            ].map((metric) => (
              <article key={metric.label} className="panel" style={{ padding: 22 }}>
                <div className="muted">{metric.label}</div>
                <div style={{ marginTop: 10, fontSize: 34, fontWeight: 800 }}>{metric.value}</div>
              </article>
            ))}
          </section>

          <PanelGrid>
            <article className="panel" style={{ padding: 24 }}>
              <h2 style={{ marginTop: 0 }}>Company profile</h2>
              <div className="stack">
                <div><strong>Name:</strong> {data.company?.company.name ?? "-"}</div>
                <div><strong>Slug:</strong> {data.company?.company.slug ?? "-"}</div>
                <div><strong>Assets:</strong> {data.company?.metrics.assets ?? 0}</div>
              </div>
            </article>
            <article className="panel" style={{ padding: 24 }}>
              <h2 style={{ marginTop: 0 }}>Latest notifications</h2>
              <div className="stack">
                {(data.notifications ?? []).slice(0, 5).map((item) => (
                  <div key={item.id} style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                    <div style={{ fontWeight: 700 }}>{item.title}</div>
                    <div className="muted">{item.channel} - {item.status}</div>
                  </div>
                ))}
              </div>
            </article>
          </PanelGrid>
        </>
      )}
    </ProtectedWorkspace>
  );
}

export function AdminDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<{ companies: number; subscriptions: number; demoAccounts: number; auditLogs: number } | null>(null);
  const [companies, setCompanies] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyCompanyId, setBusyCompanyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: "",
    slug: "",
    planCode: "growth",
    databaseName: "",
    databaseUser: "",
    databasePassword: "",
    ownerEmail: "",
    ownerPassword: ""
  });

  async function load() {
    try {
      const [nextDashboard, nextCompanies] = await Promise.all([
        apiRequest<{ companies: number; subscriptions: number; demoAccounts: number; auditLogs: number }>("platform-admin/dashboard"),
        apiRequest<Array<Record<string, unknown>>>("platform-admin/companies")
      ]);
      setDashboard(nextDashboard);
      setCompanies(nextCompanies);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load admin workspace.");
    }
  }

  useEffect(() => { void load(); }, []);

  function slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function populateFromCompanyName(value: string) {
    const slug = slugify(value);

    setForm((current) => ({
      ...current,
      companyName: value,
      slug: current.slug || slug,
      databaseName: current.databaseName || `tna_tenant_${slug.replace(/-/g, "_")}`,
      databaseUser: current.databaseUser || `${slug.replace(/-/g, "_").slice(0, 20)}_user`
    }));
  }

  async function handleCreateTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      await apiRequest("tenants", { method: "POST", body: JSON.stringify(form) });
      setForm({
        companyName: "",
        slug: "",
        planCode: "growth",
        databaseName: "",
        databaseUser: "",
        databasePassword: "",
        ownerEmail: "",
        ownerPassword: ""
      });
      setSuccess("Company workspace created successfully.");
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create company.");
    }
  }

  async function handleCompanyAction(companyId: string, action: "suspend" | "activate" | "delete") {
    setError(null);
    setSuccess(null);
    setBusyCompanyId(companyId);

    try {
      if (action === "delete") {
        await apiRequest(`platform-admin/companies/${companyId}`, { method: "DELETE" });
        setSuccess("Company deleted successfully.");
      } else {
        await apiRequest(`platform-admin/companies/${companyId}/${action}`, { method: "PATCH" });
        setSuccess(action === "suspend" ? "Company suspended successfully." : "Company re-enabled successfully.");
      }

      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Company action failed.");
    } finally {
      setBusyCompanyId(null);
    }
  }

  async function handleOpenCompany(companyId: string) {
    setError(null);
    setSuccess(null);
    setBusyCompanyId(companyId);

    try {
      const tokens = await apiRequest<AuthTokenResponse>(`platform-admin/companies/${companyId}/support-session`, { method: "POST" });
      persistSession(buildSession(tokens));
      router.replace("/dashboard");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to open company workspace.");
    } finally {
      setBusyCompanyId(null);
    }
  }

  return (
    <ProtectedWorkspace allow="admin" description="Manage companies, subscriptions, and tenant provisioning." title="Platform Admin">
      {() => (
        <>
          <ErrorText error={error} />
          {success ? <div className="panel" style={{ padding: 18, borderRadius: 18 }}>{success}</div> : null}
          <section className="metric-grid">
            {[
              { label: "Companies", value: dashboard?.companies ?? 0 },
              { label: "Subscriptions", value: dashboard?.subscriptions ?? 0 },
              { label: "Demo Accounts", value: dashboard?.demoAccounts ?? 0 },
              { label: "Audit Logs", value: dashboard?.auditLogs ?? 0 }
            ].map((metric) => (
              <article key={metric.label} className="panel" style={{ padding: 22 }}>
                <div className="muted">{metric.label}</div>
                <div style={{ marginTop: 10, fontSize: 34, fontWeight: 800 }}>{metric.value}</div>
              </article>
            ))}
          </section>
          <PanelGrid>
            <article className="panel" style={{ padding: 24 }}>
              <h2 style={{ marginTop: 0 }}>Create company workspace</h2>
              <form className="stack" onSubmit={handleCreateTenant}>
                <TextField label="Company name" onChange={populateFromCompanyName} value={form.companyName} />
                <TextField label="Slug" onChange={(value) => setForm((current) => ({ ...current, slug: value }))} value={form.slug} />
                <TextField label="Plan code" onChange={(value) => setForm((current) => ({ ...current, planCode: value }))} value={form.planCode} />
                <TextField label="Database name" onChange={(value) => setForm((current) => ({ ...current, databaseName: value }))} value={form.databaseName} />
                <TextField label="Database user" onChange={(value) => setForm((current) => ({ ...current, databaseUser: value }))} value={form.databaseUser} />
                <TextField label="Database password" onChange={(value) => setForm((current) => ({ ...current, databasePassword: value }))} type="password" value={form.databasePassword} />
                <TextField label="Owner email" onChange={(value) => setForm((current) => ({ ...current, ownerEmail: value }))} type="email" value={form.ownerEmail} />
                <TextField label="Owner password" onChange={(value) => setForm((current) => ({ ...current, ownerPassword: value }))} type="password" value={form.ownerPassword} />
                <button className="button" type="submit">Create Company</button>
              </form>
            </article>
            <article className="panel" style={{ padding: 24 }}>
              <h2 style={{ marginTop: 0 }}>Provisioned companies</h2>
              <div className="stack">
                {companies.map((company) => (
                  <div key={String(company.id)} style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                    <div style={{ fontWeight: 700 }}>{String(company.name)}</div>
                    <div className="muted">
                      {String(company.slug)} - {String(company.status ?? "UNKNOWN")}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                      <button
                        className="button"
                        disabled={busyCompanyId === String(company.id)}
                        onClick={() => void handleOpenCompany(String(company.id))}
                        type="button"
                      >
                        Open Dashboard
                      </button>
                      {String(company.status) === "SUSPENDED" ? (
                        <button
                          className="button button-subtle"
                          disabled={busyCompanyId === String(company.id)}
                          onClick={() => void handleCompanyAction(String(company.id), "activate")}
                          type="button"
                        >
                          Enable
                        </button>
                      ) : (
                        <button
                          className="button button-subtle"
                          disabled={busyCompanyId === String(company.id)}
                          onClick={() => void handleCompanyAction(String(company.id), "suspend")}
                          type="button"
                        >
                          Suspend
                        </button>
                      )}
                      <button
                        className="button button-danger"
                        disabled={busyCompanyId === String(company.id)}
                        onClick={() => void handleCompanyAction(String(company.id), "delete")}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </PanelGrid>
        </>
      )}
    </ProtectedWorkspace>
  );
}

function createCrudPage(config: {
  title: string;
  description: string;
  path: string;
  fields: Array<{ key: string; label: string; type?: string }>;
  initialData?: Record<string, string>;
  list: (item: Record<string, unknown>) => React.ReactNode;
}) {
  return function CrudPage() {
    const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<Record<string, string>>(
      config.initialData ?? Object.fromEntries(config.fields.map((field) => [field.key, ""]))
    );

    async function load() {
      try {
        setItems(await apiRequest<Array<Record<string, unknown>>>(config.path));
        setError(null);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : `Failed to load ${config.title.toLowerCase()}.`);
      }
    }

    useEffect(() => { void load(); }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      await apiRequest(config.path, { method: "POST", body: JSON.stringify(form) });
      setForm(config.initialData ?? Object.fromEntries(config.fields.map((field) => [field.key, ""])));
      await load();
    }

    return (
      <ProtectedWorkspace allow="tenant" description={config.description} title={config.title}>
        {() => (
          <PanelGrid>
            <article className="panel" style={{ padding: 24 }}>
              <h2 style={{ marginTop: 0 }}>Create {config.title.slice(0, -1)}</h2>
              <form className="stack" onSubmit={handleSubmit}>
                {config.fields.map((field) => (
                  <TextField
                    key={field.key}
                    label={field.label}
                    onChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
                    type={field.type}
                    value={form[field.key] ?? ""}
                  />
                ))}
                <button className="button" type="submit">Create</button>
              </form>
              <ErrorText error={error} />
            </article>
            <article className="panel" style={{ padding: 24 }}>
              <h2 style={{ marginTop: 0 }}>{config.title} list</h2>
              <div className="stack">
                {items.map((item) => (
                  <div key={String(item.id)} style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                    {config.list(item)}
                  </div>
                ))}
              </div>
            </article>
          </PanelGrid>
        )}
      </ProtectedWorkspace>
    );
  };
}

export function JobsPage() {
  const { jobs, users, error, reload } = useJobsAndUsers();
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [form, setForm] = useState<{
    title: string;
    companyJobNumber: string;
    customerJobNumber: string;
    siteAddress: string;
    status: string;
    scheduledDays: string[];
    dailyAssignments: Record<string, string[]>;
  }>({
    title: "",
    companyJobNumber: "",
    customerJobNumber: "",
    siteAddress: "",
    status: JOB_STATUS_VALUES[1],
    scheduledDays: [],
    dailyAssignments: {}
  });
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedOperativeId, setSelectedOperativeId] = useState("");
  const usersById = new Map(users.map((user) => [user.id, user]));
  const operativeOptions = users.filter((user) => user.role === "OPERATIVE");

  function buildDateRange(start: string, end: string) {
    if (!start || !end) {
      return [] as string[];
    }

    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);

    if (endDate < startDate) {
      return [] as string[];
    }

    const days: string[] = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      days.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return days;
  }

  function addScheduledDay() {
    if (!selectedDay) {
      return;
    }

    setForm((current) => ({
      ...current,
      scheduledDays: current.scheduledDays.includes(selectedDay)
        ? current.scheduledDays
        : [...current.scheduledDays, selectedDay].sort(),
      dailyAssignments: current.dailyAssignments[selectedDay]
        ? current.dailyAssignments
        : { ...current.dailyAssignments, [selectedDay]: [] }
    }));
    setSelectedDay("");
  }

  function applyDateRange() {
    const days = buildDateRange(rangeStart, rangeEnd);
    if (days.length === 0) {
      return;
    }

    setForm((current) => ({
      ...current,
      scheduledDays: days,
      dailyAssignments: Object.fromEntries(
        days.map((day) => [day, current.dailyAssignments[day] ?? []])
      )
    }));
  }

  function removeScheduledDay(day: string) {
    setForm((current) => ({
      ...current,
      scheduledDays: current.scheduledDays.filter((entry) => entry !== day),
      dailyAssignments: Object.fromEntries(
        Object.entries(current.dailyAssignments).filter(([entry]) => entry !== day)
      )
    }));
  }

  function addOperative() {
    if (!selectedOperativeId || form.scheduledDays.length === 0) {
      return;
    }

    setForm((current) => ({
      ...current,
      dailyAssignments: Object.fromEntries(
        current.scheduledDays.map((day) => [
          day,
          current.dailyAssignments[day]?.includes(selectedOperativeId)
            ? current.dailyAssignments[day]
            : [...(current.dailyAssignments[day] ?? []), selectedOperativeId]
        ])
      )
    }));
    setSelectedOperativeId("");
  }

  function removeOperative(day: string, userId: string) {
    setForm((current) => ({
      ...current,
      dailyAssignments: {
        ...current.dailyAssignments,
        [day]: (current.dailyAssignments[day] ?? []).filter((id) => id !== userId)
      }
    }));
  }

  function resetForm() {
    setForm({
      title: "",
      companyJobNumber: "",
      customerJobNumber: "",
      siteAddress: "",
      status: JOB_STATUS_VALUES[1],
      scheduledDays: [],
      dailyAssignments: {}
    });
    setSelectedDay("");
    setRangeStart("");
    setRangeEnd("");
    setSelectedOperativeId("");
    setEditingJobId(null);
  }

  function startEdit(job: JobRecord) {
    const scheduledDays = (job.scheduledDays ?? []).length > 0
      ? [...job.scheduledDays].sort()
      : [job.scheduledFor ? new Date(job.scheduledFor).toISOString().slice(0, 10) : ""].filter(Boolean);
    setEditingJobId(job.id);
    setForm({
      title: job.title,
      companyJobNumber: job.companyJobNumber,
      customerJobNumber: job.customerJobNumber,
      siteAddress: job.siteAddress,
      status: job.status,
      scheduledDays,
      dailyAssignments: Object.fromEntries(
        scheduledDays.map((day) => [day, getAssignedUsersForDay(job, day)])
      )
    });
    setRangeStart(scheduledDays[0] ?? "");
    setRangeEnd(scheduledDays[scheduledDays.length - 1] ?? "");
  }

  useEffect(() => {
    if (typeof window === "undefined" || jobs.length === 0) {
      return;
    }

    const requestedJobId = new URLSearchParams(window.location.search).get("edit");
    if (!requestedJobId) {
      return;
    }

    const job = jobs.find((entry) => entry.id === requestedJobId);
    if (!job) {
      return;
    }

    startEdit(job);
  }, [jobs]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...form,
      scheduledFor: rangeStart ? `${rangeStart}T00:00:00` : undefined,
      scheduledTo: rangeEnd ? `${rangeEnd}T23:59:59` : undefined,
      dailyAssignments: Object.fromEntries(
        form.scheduledDays.map((day) => [day, form.dailyAssignments[day] ?? []])
      )
    };
    if (editingJobId) {
      await apiRequest(`jobs/${editingJobId}`, { method: "PATCH", body: JSON.stringify(payload) });
    } else {
      await apiRequest("jobs", { method: "POST", body: JSON.stringify(payload) });
    }
    resetForm();
    await reload();
  }

  const assignmentWarnings = form.scheduledDays.flatMap((day) =>
    (form.dailyAssignments[day] ?? []).flatMap((userId) => {
      const conflicts = jobs.filter((job) =>
        job.id !== editingJobId &&
        getAssignedUsersForDay(job, day).includes(userId)
      );

      return conflicts.map((job) => ({
        day,
        userId,
        userName: usersById.get(userId)?.fullName ?? userId,
        jobTitle: job.title,
        companyJobNumber: job.companyJobNumber
      }));
    })
  );

  return (
    <ProtectedWorkspace allow="tenant" description="Create and track operational jobs across sites." title="Jobs">
      {() => (
        <PanelGrid>
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>{editingJobId ? "Edit job" : "Create job"}</h2>
            <form className="stack" onSubmit={handleSubmit}>
              <TextField label="Title" onChange={(value) => setForm((current) => ({ ...current, title: value }))} value={form.title} />
              <TextField label="Company job number" onChange={(value) => setForm((current) => ({ ...current, companyJobNumber: value }))} value={form.companyJobNumber} />
              <TextField label="Customer job number" onChange={(value) => setForm((current) => ({ ...current, customerJobNumber: value }))} value={form.customerJobNumber} />
              <TextField label="Site address" onChange={(value) => setForm((current) => ({ ...current, siteAddress: value }))} value={form.siteAddress} />
              <SelectField label="Status" onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[...JOB_STATUS_VALUES]} value={form.status} />
              <div className="field">
                <span>Schedule range</span>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                  <label className="field" style={{ flex: "1 1 220px" }}>
                    <span>Start date</span>
                    <input className="input" onChange={(event) => setRangeStart(event.target.value)} type="date" value={rangeStart} />
                  </label>
                  <label className="field" style={{ flex: "1 1 220px" }}>
                    <span>Finish date</span>
                    <input className="input" onChange={(event) => setRangeEnd(event.target.value)} type="date" value={rangeEnd} />
                  </label>
                  <button className="button button-subtle" onClick={applyDateRange} type="button">Apply Range</button>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {form.scheduledDays.length === 0 ? <div className="muted">No days selected.</div> : null}
                  {form.scheduledDays.map((day) => (
                    <div key={day} className="assignment-pill">
                      <span>{new Date(`${day}T00:00:00`).toLocaleDateString()}</span>
                      <button className="assignment-pill-remove" onClick={() => removeScheduledDay(day)} type="button">Remove</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                  <label className="field" style={{ flex: "1 1 220px" }}>
                    <span>Add one extra day</span>
                    <input className="input" onChange={(event) => setSelectedDay(event.target.value)} type="date" value={selectedDay} />
                  </label>
                  <button className="button button-subtle" onClick={addScheduledDay} type="button">Add Single Day</button>
                </div>
              </div>
              <div className="field">
                <span>Assign operatives by day</span>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                  <label className="field" style={{ flex: "1 1 260px" }}>
                    <span>Select team member</span>
                    <select className="input" onChange={(event) => setSelectedOperativeId(event.target.value)} value={selectedOperativeId}>
                      <option value="">Choose a team member</option>
                      {operativeOptions.map((user) => (
                        <option key={user.id} value={user.id}>{user.fullName} ({user.role})</option>
                      ))}
                    </select>
                  </label>
                  <button className="button button-subtle" onClick={addOperative} type="button">Add to Entire Job</button>
                </div>
                {assignmentWarnings.length > 0 ? (
                  <div className="error-banner">
                    {assignmentWarnings.map((warning) => (
                      <div key={`${warning.day}-${warning.userId}-${warning.companyJobNumber}`}>
                        {warning.userName} already has {warning.companyJobNumber} ({warning.jobTitle}) on {new Date(`${warning.day}T00:00:00`).toLocaleDateString()}.
                        You can still save this job, or remove them from that day below if they need relocating.
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="stack">
                  {form.scheduledDays.length === 0 ? <div className="muted">Add scheduled days before assigning people.</div> : null}
                  {form.scheduledDays.map((day) => (
                    <div key={day} className="panel" style={{ padding: 16 }}>
                      <div style={{ fontWeight: 700, marginBottom: 10 }}>{new Date(`${day}T00:00:00`).toLocaleDateString()}</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {(form.dailyAssignments[day] ?? []).length === 0 ? <div className="muted">No team members assigned.</div> : null}
                        {(form.dailyAssignments[day] ?? []).map((userId) => (
                          <div key={`${day}-${userId}`} className="assignment-pill">
                            <span>{usersById.get(userId)?.fullName ?? userId}</span>
                            <button className="assignment-pill-remove" onClick={() => removeOperative(day, userId)} type="button">Remove</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button className="button" type="submit">{editingJobId ? "Save Changes" : "Create Job"}</button>
                {editingJobId ? (
                  <button className="button button-subtle" onClick={resetForm} type="button">Cancel Edit</button>
                ) : null}
              </div>
            </form>
            <ErrorText error={error} />
          </article>
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Job board</h2>
            <div className="stack">
              {jobs.map((job) => (
                <div key={job.id} style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                    <div style={{ fontWeight: 700 }}>{job.title}</div>
                    <button className="button button-subtle" onClick={() => startEdit(job)} type="button">Edit</button>
                  </div>
                  <div className="muted">
                    {job.companyJobNumber} / {job.customerJobNumber} - {job.status}
                  </div>
                  <div className="muted">{job.siteAddress}</div>
                  <div className="muted">
                    Scheduled: {(job.scheduledDays ?? []).length > 0
                      ? job.scheduledDays.map((day) => new Date(`${day}T00:00:00`).toLocaleDateString()).join(", ")
                      : "Not scheduled"}
                  </div>
                  <div className="muted">
                    Assigned: {job.scheduledDays.flatMap((day) => getAssignedUsersForDay(job, day)).length > 0
                      ? [...new Set(job.scheduledDays.flatMap((day) => getAssignedUsersForDay(job, day)))].map((id) => usersById.get(id)?.fullName ?? id).join(", ")
                      : "Unassigned"}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </PanelGrid>
      )}
    </ProtectedWorkspace>
  );
}

export function CalendarPage() {
  const { jobs, users, error } = useJobsAndUsers();
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const current = new Date();
    return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  });
  const [weekFocusDate, setWeekFocusDate] = useState(() => toDateKey(new Date()));
  const [calendarMode, setCalendarMode] = useState<"team-week" | "show-all-jobs">("team-week");

  return (
    <ProtectedWorkspace allow="tenant" description="Monthly assignment view by employee and scheduled job date." title="Calendar">
      {(session) => (
        <CalendarWorkspace
          calendarMonth={calendarMonth}
          calendarMode={calendarMode}
          error={error}
          jobs={jobs}
          session={session}
          setCalendarMonth={setCalendarMonth}
          setCalendarMode={setCalendarMode}
          setWeekFocusDate={setWeekFocusDate}
          users={users}
          weekFocusDate={weekFocusDate}
        />
      )}
    </ProtectedWorkspace>
  );
}

function CalendarWorkspace({
  session,
  jobs,
  users,
  error,
  calendarMonth,
  calendarMode,
  setCalendarMonth,
  setCalendarMode,
  weekFocusDate,
  setWeekFocusDate
}: Readonly<{
  session: AppSession;
  jobs: JobRecord[];
  users: UserRecord[];
  error: string | null;
  calendarMonth: string;
  calendarMode: "team-week" | "show-all-jobs";
  setCalendarMonth: (value: string) => void;
  setCalendarMode: (value: "team-week" | "show-all-jobs") => void;
  weekFocusDate: string;
  setWeekFocusDate: (value: string) => void;
}>) {
  const isManager = MANAGER_ROLES.has(session.user.role);
  const defaultEmployee = !isManager ? session.user.sub : "all";
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(defaultEmployee);

  const [year, month] = calendarMonth.split("-").map((part) => Number(part));
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const operativeUsers = users.filter((user) => user.role === "OPERATIVE");
  const lastDayOfMonth = new Date(year, month - 1, daysInMonth, 23, 59, 59, 999);
  const currentWeekStart = startOfWeek(new Date(`${weekFocusDate}T00:00:00`));
  const boardDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(currentWeekStart);
    day.setDate(currentWeekStart.getDate() + index);
    return day;
  });
  const jobsForMonth = jobs.filter((job) => {
    const scheduledDays = job.scheduledDays ?? [];
    if (scheduledDays.length === 0 && !job.scheduledFor) {
      return false;
    }
    if (scheduledDays.length > 0) {
      return scheduledDays.some((day) => {
        const current = new Date(`${day}T00:00:00`);
        return current >= firstDayOfMonth && current <= lastDayOfMonth;
      });
    }

    const singleDay = new Date(job.scheduledFor as string);
    singleDay.setHours(0, 0, 0, 0);
    return singleDay >= firstDayOfMonth && singleDay <= lastDayOfMonth;
  });

  useEffect(() => {
    if (!isManager) {
      setSelectedEmployeeId(session.user.sub);
    }
  }, [isManager, session.user.sub]);

  function jobsForEmployeeOnDay(userId: string, day: string) {
    return jobs.filter((job) => getAssignedUsersForDay(job, day).includes(userId));
  }

  const visibleJobsForBoard = selectedEmployeeId === "all"
    ? jobsForMonth
    : jobsForMonth.filter((job) =>
        Object.values(getJobDailyAssignments(job)).some((assignedUsers) => assignedUsers.includes(selectedEmployeeId))
      );

  const showTeamWeek = isManager && selectedEmployeeId === "all" && calendarMode === "team-week";

  return (
    <article className="panel" style={{ padding: 24 }}>
          <ErrorText error={error} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0 }}>Staff job calendar</h2>
              <div className="muted" style={{ marginTop: 8 }}>Month view with each day showing scheduled jobs and assigned employees.</div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {showTeamWeek ? (
                <>
                  <div className="field" style={{ minWidth: 280 }}>
                    <span>Schedule window</span>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button className="button button-subtle" onClick={() => setWeekFocusDate(shiftDateKey(weekFocusDate, -7))} type="button">
                        Previous
                      </button>
                      <input className="input" onChange={(event) => setWeekFocusDate(event.target.value)} type="date" value={weekFocusDate} />
                      <button className="button button-subtle" onClick={() => setWeekFocusDate(shiftDateKey(weekFocusDate, 7))} type="button">
                        Next
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <label className="field" style={{ minWidth: 220 }}>
                  <span>Calendar month</span>
                  <input className="input" onChange={(event) => setCalendarMonth(event.target.value)} type="month" value={calendarMonth} />
                </label>
              )}
              <label className="field" style={{ minWidth: 220 }}>
                <span>{isManager ? "Employee schedule" : "Viewing"}</span>
                <select
                  className="input"
                  disabled={!isManager}
                  onChange={(event) => setSelectedEmployeeId(event.target.value)}
                  value={selectedEmployeeId}
                >
                  {isManager ? <option value="all">All employees</option> : null}
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.fullName}</option>
                  ))}
                </select>
              </label>
              {isManager ? (
                <div className="field" style={{ minWidth: 260 }}>
                  <span>View mode</span>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      className={calendarMode === "team-week" ? "button" : "button button-subtle"}
                      onClick={() => setCalendarMode("team-week")}
                      type="button"
                    >
                      Team Week
                    </button>
                    <button
                      className={calendarMode === "show-all-jobs" ? "button" : "button button-subtle"}
                      onClick={() => setCalendarMode("show-all-jobs")}
                      type="button"
                    >
                      Show All Jobs
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          {showTeamWeek ? (
            <div className="schedule-board-wrap" style={{ marginTop: 20 }}>
              <div className="schedule-board">
                <div className="schedule-board-corner">
                  <div style={{ fontWeight: 800 }}>Schedule</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {boardDays[0].toLocaleDateString()} - {boardDays[boardDays.length - 1].toLocaleDateString()}
                  </div>
                </div>
                {boardDays.map((day) => (
                  <div key={day.toISOString()} className={`schedule-board-header ${day.getDay() === 0 || day.getDay() === 6 ? "schedule-board-header-weekend" : ""}`}>
                    <div>{day.toLocaleDateString(undefined, { weekday: "short" })}</div>
                    <div>{day.getDate()}</div>
                  </div>
                ))}
                {operativeUsers.map((user) => (
                  <Fragment key={user.id}>
                    <div className="schedule-board-user">
                      <div className="schedule-board-user-name">{user.fullName}</div>
                      <div className="schedule-board-user-role">{user.role}</div>
                    </div>
                    {boardDays.map((day) => {
                      const dayKey = toDateKey(day);
                      const dayJobs = jobsForEmployeeOnDay(user.id, dayKey);
                      return (
                        <div
                          key={`${user.id}-${dayKey}`}
                          className={`schedule-board-cell ${day.getDay() === 0 || day.getDay() === 6 ? "schedule-board-cell-weekend" : ""}`}
                        >
                          {dayJobs.length === 0 ? <div className="schedule-board-empty">-</div> : null}
                          {dayJobs.map((job) => (
                            <Link
                              key={job.id}
                              className="schedule-job-chip"
                              href={`/dashboard/jobs?edit=${encodeURIComponent(job.id)}`}
                              style={getJobChipStyle(job.status)}
                            >
                              <div className="schedule-job-chip-code">{job.companyJobNumber}</div>
                              <div className="schedule-job-chip-title">{job.title}</div>
                            </Link>
                          ))}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          ) : (
            <div className="jobs-board-wrap" style={{ marginTop: 20 }}>
              <div className="jobs-board" style={{ gridTemplateColumns: `240px repeat(${daysInMonth}, minmax(28px, 1fr))` }}>
                <div className="jobs-board-corner">
                  <div style={{ fontWeight: 800 }}>All Jobs</div>
                  <div className="muted" style={{ fontSize: 12 }}>{firstDayOfMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
                </div>
                {monthDays.map((day) => {
                  const current = new Date(year, month - 1, day);
                  const weekend = current.getDay() === 0 || current.getDay() === 6;
                  return (
                    <div key={day} className={`jobs-board-header ${weekend ? "jobs-board-header-weekend" : ""}`}>
                      <div>{day}</div>
                    </div>
                  );
                })}
                {visibleJobsForBoard.map((job) => (
                  <Fragment key={job.id}>
                    <div className="jobs-board-job">
                      <Link href={`/dashboard/jobs?edit=${encodeURIComponent(job.id)}`}>
                        <div className="jobs-board-job-code">{job.companyJobNumber}</div>
                        <div className="jobs-board-job-title">{job.title}</div>
                      </Link>
                    </div>
                    {monthDays.map((day) => {
                      const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const current = new Date(year, month - 1, day);
                      const weekend = current.getDay() === 0 || current.getDay() === 6;
                      const scheduled = (job.scheduledDays ?? []).includes(dayKey);
                      return (
                        <div key={`${job.id}-${dayKey}`} className={`jobs-board-cell ${weekend ? "jobs-board-cell-weekend" : ""}`}>
                          {scheduled ? (
                            <Link
                              className="jobs-board-chip"
                              href={`/dashboard/jobs?edit=${encodeURIComponent(job.id)}`}
                              style={getJobChipStyle(job.status)}
                              title={`${job.companyJobNumber} - ${job.title}`}
                            >
                              {job.companyJobNumber}
                            </Link>
                          ) : null}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </article>
  );
}

export function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    email: string;
    fullName: string;
    role: string;
    password: string;
  }>({
    email: "",
    fullName: "",
    role: ROLE_VALUES[1],
    password: ""
  });

  async function load() {
    try {
      setUsers(await apiRequest<UserRecord[]>("users"));
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load users.");
    }
  }

  useEffect(() => { void load(); }, []);

  function resetForm() {
    setForm({
      email: "",
      fullName: "",
      role: ROLE_VALUES[1],
      password: ""
    });
    setEditingUserId(null);
  }

  function startEdit(user: UserRecord) {
    setEditingUserId(user.id);
    setForm({
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      password: ""
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingUserId) {
      const payload = {
        email: form.email,
        fullName: form.fullName,
        role: form.role,
        ...(form.password ? { password: form.password } : {})
      };
      await apiRequest(`users/${editingUserId}`, { method: "PATCH", body: JSON.stringify(payload) });
    } else {
      await apiRequest("users", { method: "POST", body: JSON.stringify(form) });
    }
    resetForm();
    await load();
  }

  return (
    <ProtectedWorkspace allow="tenant" description="Manage company users and role access." title="Team">
      {() => (
        <PanelGrid>
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>{editingUserId ? "Edit user" : "Create user"}</h2>
            <form className="stack" onSubmit={handleSubmit}>
              <TextField label="Email" onChange={(value) => setForm((current) => ({ ...current, email: value }))} type="email" value={form.email} />
              <TextField label="Full name" onChange={(value) => setForm((current) => ({ ...current, fullName: value }))} value={form.fullName} />
              <SelectField label="Role" onChange={(value) => setForm((current) => ({ ...current, role: value }))} options={[...ROLE_VALUES]} value={form.role} />
              <TextField
                label={editingUserId ? "New password (optional)" : "Password"}
                onChange={(value) => setForm((current) => ({ ...current, password: value }))}
                type="password"
                value={form.password}
              />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button className="button" type="submit">{editingUserId ? "Save Changes" : "Create User"}</button>
                {editingUserId ? (
                  <button className="button button-subtle" onClick={resetForm} type="button">Cancel Edit</button>
                ) : null}
              </div>
            </form>
            <ErrorText error={error} />
          </article>
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Current users</h2>
            <div className="stack">
              {users.map((user) => (
                <button
                  key={user.id}
                  className="button button-subtle"
                  onClick={() => startEdit(user)}
                  style={{ justifyContent: "space-between", width: "100%", borderRadius: 18, padding: 16 }}
                  type="button"
                >
                  <span style={{ display: "grid", gap: 6, textAlign: "left" }}>
                    <span style={{ fontWeight: 700 }}>{user.fullName}</span>
                    <span className="muted">{user.email} - {user.role}</span>
                  </span>
                  <span>Edit</span>
                </button>
              ))}
            </div>
          </article>
        </PanelGrid>
      )}
    </ProtectedWorkspace>
  );
}

export const AssetsPage = createCrudPage({
  title: "Assets",
  description: "Track plant, tools, and tagged field equipment.",
  path: "assets",
  fields: [
    { key: "name", label: "Asset name" },
    { key: "serialNumber", label: "Serial number" }
  ],
  list: (item) => (
    <>
      <div style={{ fontWeight: 700 }}>{String(item.name)}</div>
      <div className="muted">{String(item.serialNumber)}</div>
    </>
  )
});

export function DocumentsPage() {
  const [documents, setDocuments] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  async function load() {
    try {
      setDocuments(await apiRequest<Array<Record<string, unknown>>>("documents"));
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load documents.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiRequest("documents/placeholder", {
      method: "POST",
      body: JSON.stringify({ name, content })
    });
    setName("");
    setContent("");
    await load();
  }

  return (
    <ProtectedWorkspace allow="tenant" description="Generate placeholder documentation and keep records visible." title="Documents">
      {() => (
        <PanelGrid>
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Create document</h2>
            <form className="stack" onSubmit={handleSubmit}>
              <TextField label="Document name" onChange={setName} value={name} />
              <TextAreaField label="Document content" onChange={setContent} value={content} />
              <button className="button" type="submit">Create Document</button>
            </form>
            <ErrorText error={error} />
          </article>
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Document list</h2>
            <div className="stack">
              {documents.map((document) => (
                <div key={String(document.id)} style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                  <div style={{ fontWeight: 700 }}>{String(document.name)}</div>
                  <div className="muted">{String(document.mimeType)}</div>
                </div>
              ))}
            </div>
          </article>
        </PanelGrid>
      )}
    </ProtectedWorkspace>
  );
}

export function FormsPage() {
  const [forms, setForms] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("Daily Inspection");
  const [schemaJson, setSchemaJson] = useState(JSON.stringify({
    id: "daily-inspection",
    name: "Daily Inspection",
    version: 1,
    sections: [{ id: "checks", title: "Checks", fields: [{ id: "safe", type: "checkbox", label: "Site safe?", required: true }] }]
  }, null, 2));

  async function load() {
    try {
      setForms(await apiRequest<Array<Record<string, unknown>>>("forms/definitions"));
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load forms.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = JSON.parse(schemaJson) as Record<string, unknown>;
    await apiRequest("forms/definitions", {
      method: "POST",
      body: JSON.stringify({ ...parsed, name })
    });
    await load();
  }

  return (
    <ProtectedWorkspace allow="tenant" description="Publish reusable field forms for crews and auditors." title="Forms">
      {() => (
        <PanelGrid>
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Create form definition</h2>
            <form className="stack" onSubmit={handleSubmit}>
              <TextField label="Form name" onChange={setName} value={name} />
              <TextAreaField label="Schema JSON" onChange={setSchemaJson} value={schemaJson} />
              <button className="button" type="submit">Save Form</button>
            </form>
            <ErrorText error={error} />
          </article>
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Published forms</h2>
            <div className="stack">
              {forms.map((form) => (
                <div key={String(form.id)} style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                  <div style={{ fontWeight: 700 }}>{String(form.name)}</div>
                  <div className="muted">Version {String(form.version)}</div>
                </div>
              ))}
            </div>
          </article>
        </PanelGrid>
      )}
    </ProtectedWorkspace>
  );
}

export function NotificationsPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function load() {
    try {
      setItems(await apiRequest<Array<Record<string, unknown>>>("notifications"));
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load notifications.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiRequest("notifications", { method: "POST", body: JSON.stringify({ title, body }) });
    setTitle("");
    setBody("");
    await load();
  }

  return (
    <ProtectedWorkspace allow="tenant" description="Queue team-facing notifications and review recent activity." title="Notifications">
      {() => (
        <PanelGrid>
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Create notification</h2>
            <form className="stack" onSubmit={handleSubmit}>
              <TextField label="Title" onChange={setTitle} value={title} />
              <TextAreaField label="Body" onChange={setBody} value={body} />
              <button className="button" type="submit">Queue Notification</button>
            </form>
            <ErrorText error={error} />
          </article>
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Recent notifications</h2>
            <div className="stack">
              {items.map((item) => (
                <div key={String(item.id)} style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                  <div style={{ fontWeight: 700 }}>{String(item.title)}</div>
                  <div className="muted">{String(item.channel)} - {String(item.status)}</div>
                </div>
              ))}
            </div>
          </article>
        </PanelGrid>
      )}
    </ProtectedWorkspace>
  );
}

export function ReportingPage() {
  const [summary, setSummary] = useState<ReportingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<ReportingSummary>("reporting/summary")
      .then(setSummary)
      .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "Failed to load reporting."));
  }, []);

  return (
    <ProtectedWorkspace allow="tenant" description="Review business performance and operational workload." title="Reporting">
      {() => (
        <>
          <ErrorText error={error} />
          <section className="metric-grid">
            {[
              { label: "Jobs", value: summary?.jobs ?? 0 },
              { label: "Completed", value: summary?.completedJobs ?? 0 },
              { label: "Scheduled", value: summary?.scheduledJobs ?? 0 },
              { label: "Active Users", value: summary?.activeUsers ?? 0 }
            ].map((metric) => (
              <article key={metric.label} className="panel" style={{ padding: 22 }}>
                <div className="muted">{metric.label}</div>
                <div style={{ marginTop: 10, fontSize: 34, fontWeight: 800 }}>{metric.value}</div>
              </article>
            ))}
          </section>
        </>
      )}
    </ProtectedWorkspace>
  );
}
