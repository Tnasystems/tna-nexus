"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedWorkspace } from "./protected-workspace";
import { apiRequest, apiRequestBlob } from "../lib/api";
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
  phone?: string | null;
  accountStatus?: string;
  trainingRecordsJson?: string;
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
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  scheduledDays: string[];
  dailyAssignmentsJson: string;
  assignedOperativeIds: string[];
  tasks?: Array<{ id: string; title: string; status: string }>;
}

const MANAGER_ROLES = new Set(["PLATFORM_ADMIN", "DIRECTOR", "MANAGER"]);

function canManageWorkspace(role: string) {
  return MANAGER_ROLES.has(role);
}

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

function jobDetailHref(jobId: string, tab: "details" | "schedule" = "details") {
  return `/dashboard/jobs/${encodeURIComponent(jobId)}?tab=${tab}`;
}

function userDetailHref(userId: string, tab: "schedule" | "information" | "training" | "settings" = "information") {
  return `/dashboard/users/${encodeURIComponent(userId)}?tab=${tab}`;
}

interface TrainingRecord {
  id: string;
  name: string;
  expiresOn: string;
  certificateFileName?: string;
  certificateDocumentId?: string;
  certificateMimeType?: string;
}

function parseTrainingRecords(value: string | null | undefined) {
  if (!value) {
    return [] as TrainingRecord[];
  }

  try {
    const parsed = JSON.parse(value) as TrainingRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function openProtectedFile(path: string, fallbackFileName: string) {
  const blob = await apiRequestBlob(path);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.download = fallbackFileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function getTrainingState(user: UserRecord) {
  const records = parseTrainingRecords(user.trainingRecordsJson);
  if (records.length === 0) {
    return "ok" as const;
  }

  const now = new Date();
  const warningDate = new Date();
  warningDate.setDate(now.getDate() + 30);

  if (records.some((record) => new Date(`${record.expiresOn}T00:00:00`) < now)) {
    return "expired" as const;
  }

  if (records.some((record) => new Date(`${record.expiresOn}T00:00:00`) <= warningDate)) {
    return "warning" as const;
  }

  return "ok" as const;
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

function getJobVisualStyle(job: JobRecord, hasConflict: boolean) {
  if (hasConflict) {
    return { background: "rgba(251, 113, 133, 0.22)", borderColor: "rgba(251, 113, 133, 0.5)", color: "#ffe1e6" };
  }

  return getJobChipStyle(job.status);
}

function toMinutes(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function jobsOverlapByTime(first: JobRecord, second: JobRecord) {
  const firstStart = toMinutes(first.scheduledStartTime);
  const firstEnd = toMinutes(first.scheduledEndTime);
  const secondStart = toMinutes(second.scheduledStartTime);
  const secondEnd = toMinutes(second.scheduledEndTime);

  if (firstStart === null || firstEnd === null || secondStart === null || secondEnd === null) {
    return true;
  }

  return firstStart < secondEnd && secondStart < firstEnd;
}

function hasJobConflictForUser(job: JobRecord, allJobs: JobRecord[], day: string, userId: string) {
  return allJobs.some((candidate) => (
    candidate.id !== job.id &&
    getAssignedUsersForDay(candidate, day).includes(userId) &&
    jobsOverlapByTime(job, candidate)
  ));
}

function hasJobConflict(job: JobRecord, allJobs: JobRecord[], day: string, userId?: string) {
  const users = userId ? [userId] : getAssignedUsersForDay(job, day);
  return users.some((currentUserId) => hasJobConflictForUser(job, allJobs, day, currentUserId));
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
    scheduledStartTime: string;
    scheduledEndTime: string;
    scheduledDays: string[];
    dailyAssignments: Record<string, string[]>;
  }>({
    title: "",
    companyJobNumber: "",
    customerJobNumber: "",
    siteAddress: "",
    status: JOB_STATUS_VALUES[1],
    scheduledStartTime: "08:00",
    scheduledEndTime: "17:00",
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
      scheduledStartTime: "08:00",
      scheduledEndTime: "17:00",
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
      scheduledStartTime: job.scheduledStartTime ?? "08:00",
      scheduledEndTime: job.scheduledEndTime ?? "17:00",
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
      scheduledStartTime: form.scheduledStartTime || undefined,
      scheduledEndTime: form.scheduledEndTime || undefined,
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
        getAssignedUsersForDay(job, day).includes(userId) &&
        jobsOverlapByTime(
          {
            id: editingJobId ?? "new-job",
            title: form.title,
            companyJobNumber: form.companyJobNumber,
            customerJobNumber: form.customerJobNumber,
            siteAddress: form.siteAddress,
            status: form.status,
            scheduledFor: null,
            scheduledTo: null,
            scheduledStartTime: form.scheduledStartTime || null,
            scheduledEndTime: form.scheduledEndTime || null,
            scheduledDays: form.scheduledDays,
            dailyAssignmentsJson: JSON.stringify(form.dailyAssignments),
            assignedOperativeIds: []
          },
          job
        )
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
      {(session) => {
        const canManage = canManageWorkspace(session.user.role);
        return (
        <PanelGrid>
          {canManage ? (
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>{editingJobId ? "Edit job" : "Create job"}</h2>
            <form className="stack" onSubmit={handleSubmit}>
              <TextField label="Title" onChange={(value) => setForm((current) => ({ ...current, title: value }))} value={form.title} />
              <TextField label="Company job number" onChange={(value) => setForm((current) => ({ ...current, companyJobNumber: value }))} value={form.companyJobNumber} />
              <TextField label="Customer job number" onChange={(value) => setForm((current) => ({ ...current, customerJobNumber: value }))} value={form.customerJobNumber} />
              <TextField label="Site address" onChange={(value) => setForm((current) => ({ ...current, siteAddress: value }))} value={form.siteAddress} />
              <SelectField label="Status" onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[...JOB_STATUS_VALUES]} value={form.status} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <TextField label="Working start time" onChange={(value) => setForm((current) => ({ ...current, scheduledStartTime: value }))} type="time" value={form.scheduledStartTime} />
                <TextField label="Working finish time" onChange={(value) => setForm((current) => ({ ...current, scheduledEndTime: value }))} type="time" value={form.scheduledEndTime} />
              </div>
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
                        The time window overlaps. You can still save this job, or remove them from that day below if they need relocating.
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
          ) : (
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>My assigned jobs</h2>
            <p className="muted" style={{ margin: 0 }}>You can view the jobs assigned to you and who you are working with, but only managers can create or edit jobs.</p>
            <ErrorText error={error} />
          </article>
          )}
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Job board</h2>
            <div className="stack">
              {jobs.map((job) => (
                <div key={job.id} style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                    <div style={{ fontWeight: 700 }}>{job.title}</div>
                    <Link className="button button-subtle" href={jobDetailHref(job.id, canManage ? "details" : "schedule")}>
                      {canManage ? "Open" : "View"}
                    </Link>
                  </div>
                  <div className="muted">
                    {job.companyJobNumber} / {job.customerJobNumber} - {job.status}
                  </div>
                  <div className="muted">{job.siteAddress}</div>
                  <div className="muted">
                    Working hours: {job.scheduledStartTime && job.scheduledEndTime ? `${job.scheduledStartTime} - ${job.scheduledEndTime}` : "Not set"}
                  </div>
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
      )}}
    </ProtectedWorkspace>
  );
}

export function JobRecordPage({
  initialTab = "details",
  jobId
}: Readonly<{
  initialTab?: "details" | "schedule";
  jobId: string;
}>) {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [allJobs, setAllJobs] = useState<JobRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "schedule">(initialTab);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedOperativeId, setSelectedOperativeId] = useState("");
  const [form, setForm] = useState<{
    title: string;
    companyJobNumber: string;
    customerJobNumber: string;
    siteAddress: string;
    status: string;
    scheduledStartTime: string;
    scheduledEndTime: string;
    scheduledDays: string[];
    dailyAssignments: Record<string, string[]>;
  }>({
    title: "",
    companyJobNumber: "",
    customerJobNumber: "",
    siteAddress: "",
    status: JOB_STATUS_VALUES[1],
    scheduledStartTime: "08:00",
    scheduledEndTime: "17:00",
    scheduledDays: [] as string[],
    dailyAssignments: {} as Record<string, string[]>
  });

  const usersById = new Map(users.map((user) => [user.id, user]));
  const operativeOptions = users.filter((user) => user.role === "OPERATIVE");

  async function load() {
    try {
      const [nextJob, nextUsers, nextJobs] = await Promise.all([
        apiRequest<JobRecord>(`jobs/${jobId}`),
        apiRequest<UserRecord[]>("users"),
        apiRequest<JobRecord[]>("jobs")
      ]);
      setJob(nextJob);
      setUsers(nextUsers);
      setAllJobs(nextJobs);
      const scheduledDays = (nextJob.scheduledDays ?? []).length > 0
        ? [...nextJob.scheduledDays].sort()
        : [nextJob.scheduledFor ? new Date(nextJob.scheduledFor).toISOString().slice(0, 10) : ""].filter(Boolean);
      setForm({
        title: nextJob.title,
        companyJobNumber: nextJob.companyJobNumber,
        customerJobNumber: nextJob.customerJobNumber,
        siteAddress: nextJob.siteAddress,
        status: nextJob.status,
        scheduledStartTime: nextJob.scheduledStartTime ?? "08:00",
        scheduledEndTime: nextJob.scheduledEndTime ?? "17:00",
        scheduledDays,
        dailyAssignments: Object.fromEntries(
          scheduledDays.map((day) => [day, getAssignedUsersForDay(nextJob, day)])
        )
      });
      setRangeStart(scheduledDays[0] ?? "");
      setRangeEnd(scheduledDays[scheduledDays.length - 1] ?? "");
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load job.");
    }
  }

  useEffect(() => {
    void load();
  }, [jobId]);

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

  function applyDateRange() {
    const days = buildDateRange(rangeStart, rangeEnd);
    if (days.length === 0) {
      return;
    }

    setForm((current) => ({
      ...current,
      scheduledDays: days,
      dailyAssignments: Object.fromEntries(days.map((day) => [day, current.dailyAssignments[day] ?? []]))
    }));
  }

  function addScheduledDay() {
    if (!selectedDay) {
      return;
    }

    setForm((current) => ({
      ...current,
      scheduledDays: current.scheduledDays.includes(selectedDay) ? current.scheduledDays : [...current.scheduledDays, selectedDay].sort(),
      dailyAssignments: current.dailyAssignments[selectedDay]
        ? current.dailyAssignments
        : { ...current.dailyAssignments, [selectedDay]: [] }
    }));
    setSelectedDay("");
  }

  function removeScheduledDay(day: string) {
    setForm((current) => ({
      ...current,
      scheduledDays: current.scheduledDays.filter((entry) => entry !== day),
      dailyAssignments: Object.fromEntries(Object.entries(current.dailyAssignments).filter(([entry]) => entry !== day))
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

  const overlapWarnings = form.scheduledDays.flatMap((day) =>
    (form.dailyAssignments[day] ?? []).flatMap((userId) => {
      if (!job) {
        return [];
      }

      const currentDraft: JobRecord = {
        ...job,
        title: form.title,
        companyJobNumber: form.companyJobNumber,
        customerJobNumber: form.customerJobNumber,
        siteAddress: form.siteAddress,
        status: form.status,
        scheduledStartTime: form.scheduledStartTime || null,
        scheduledEndTime: form.scheduledEndTime || null,
        scheduledDays: form.scheduledDays,
        dailyAssignmentsJson: JSON.stringify(form.dailyAssignments),
        assignedOperativeIds: [...new Set(Object.values(form.dailyAssignments).flat())]
      };

      const conflicts = allJobs.filter((candidate) =>
        candidate.id !== job.id &&
        getAssignedUsersForDay(candidate, day).includes(userId) &&
        jobsOverlapByTime(currentDraft, candidate)
      );

      return conflicts.map((candidate) => ({
        day,
        userId,
        userName: usersById.get(userId)?.fullName ?? userId,
        jobTitle: candidate.title,
        companyJobNumber: candidate.companyJobNumber
      }));
    })
  );
  void overlapWarnings;

  async function handleSave() {
    setError(null);
    setSuccess(null);
    try {
      await apiRequest(`jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          scheduledFor: rangeStart ? `${rangeStart}T00:00:00` : undefined,
          scheduledTo: rangeEnd ? `${rangeEnd}T23:59:59` : undefined,
          scheduledStartTime: form.scheduledStartTime || undefined,
          scheduledEndTime: form.scheduledEndTime || undefined,
          dailyAssignments: Object.fromEntries(
            form.scheduledDays.map((day) => [day, form.dailyAssignments[day] ?? []])
          )
        })
      });
      setSuccess("Job updated successfully.");
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to save job.");
    }
  }

  return (
    <ProtectedWorkspace allow="tenant" description="Review a single job record and manage its scheduling." title={job ? job.title : "Job Record"}>
      {(session) => {
        const canManage = canManageWorkspace(session.user.role);
        return (
        <div className="stack">
          <ErrorText error={error} />
          {success ? <div className="panel" style={{ padding: 18, borderRadius: 18 }}>{success}</div> : null}
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
              {[
                { key: "details" as const, label: "Details" },
                { key: "schedule" as const, label: "Schedule" }
              ].map((tab) => (
                <button
                  key={tab.key}
                  className={activeTab === tab.key ? "button" : "button button-subtle"}
                  onClick={() => setActiveTab(tab.key)}
                  style={{ borderRadius: 0, minWidth: 140 }}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div style={{ padding: 24 }}>
              {activeTab === "details" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 24 }}>
                  <div className="stack">
                    {canManage ? (
                      <>
                        <TextField label="Title" onChange={(value) => setForm((current) => ({ ...current, title: value }))} value={form.title} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <TextField label="Company job number" onChange={(value) => setForm((current) => ({ ...current, companyJobNumber: value }))} value={form.companyJobNumber} />
                          <TextField label="Customer job number" onChange={(value) => setForm((current) => ({ ...current, customerJobNumber: value }))} value={form.customerJobNumber} />
                        </div>
                        <TextField label="Site address" onChange={(value) => setForm((current) => ({ ...current, siteAddress: value }))} value={form.siteAddress} />
                        <SelectField label="Status" onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[...JOB_STATUS_VALUES]} value={form.status} />
                        <button className="button" onClick={handleSave} type="button">Save Job</button>
                      </>
                    ) : (
                      <div className="stack">
                        <div className="panel" style={{ padding: 16 }}><div className="muted">Title</div><div style={{ fontWeight: 700 }}>{form.title}</div></div>
                        <div className="panel" style={{ padding: 16 }}><div className="muted">Company job number</div><div style={{ fontWeight: 700 }}>{form.companyJobNumber}</div></div>
                        <div className="panel" style={{ padding: 16 }}><div className="muted">Customer job number</div><div style={{ fontWeight: 700 }}>{form.customerJobNumber}</div></div>
                        <div className="panel" style={{ padding: 16 }}><div className="muted">Site address</div><div style={{ fontWeight: 700 }}>{form.siteAddress}</div></div>
                        <div className="panel" style={{ padding: 16 }}><div className="muted">Status</div><div style={{ fontWeight: 700 }}>{form.status}</div></div>
                      </div>
                    )}
                  </div>
                  <div className="panel" style={{ padding: 20 }}>
                    <div className="stack">
                      <div>
                        <div className="muted">Job number</div>
                        <div style={{ fontWeight: 800 }}>{form.companyJobNumber || "-"}</div>
                      </div>
                      <div>
                        <div className="muted">Working hours</div>
                        <div style={{ fontWeight: 700 }}>
                          {form.scheduledStartTime && form.scheduledEndTime ? `${form.scheduledStartTime} - ${form.scheduledEndTime}` : "Not set"}
                        </div>
                      </div>
                      <div>
                        <div className="muted">Tasks</div>
                        <div style={{ fontWeight: 700 }}>{job?.tasks?.length ?? 0}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 24 }}>
                  <div className="stack">
                    {canManage ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <TextField label="Working start time" onChange={(value) => setForm((current) => ({ ...current, scheduledStartTime: value }))} type="time" value={form.scheduledStartTime} />
                      <TextField label="Working finish time" onChange={(value) => setForm((current) => ({ ...current, scheduledEndTime: value }))} type="time" value={form.scheduledEndTime} />
                    </div>
                    ) : null}
                    <div className="field">
                      <span>Schedule range</span>
                      {canManage ? (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                        <label className="field" style={{ flex: "1 1 220px" }}>
                          <span>Preferred start</span>
                          <input className="input" onChange={(event) => setRangeStart(event.target.value)} type="date" value={rangeStart} />
                        </label>
                        <label className="field" style={{ flex: "1 1 220px" }}>
                          <span>Preferred finish</span>
                          <input className="input" onChange={(event) => setRangeEnd(event.target.value)} type="date" value={rangeEnd} />
                        </label>
                        <button className="button button-subtle" onClick={applyDateRange} type="button">Apply Range</button>
                      </div>
                      ) : (
                      <div className="panel" style={{ padding: 16 }}>
                        <div style={{ fontWeight: 700 }}>
                          {form.scheduledDays.length > 0
                            ? `${new Date(`${form.scheduledDays[0]}T00:00:00`).toLocaleDateString()} - ${new Date(`${form.scheduledDays[form.scheduledDays.length - 1]}T00:00:00`).toLocaleDateString()}`
                            : "Not scheduled"}
                        </div>
                      </div>
                      )}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {form.scheduledDays.map((day) => (
                          <div key={day} className="assignment-pill">
                            <span>{new Date(`${day}T00:00:00`).toLocaleDateString()}</span>
                            <button className="assignment-pill-remove" onClick={() => removeScheduledDay(day)} type="button">Remove</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="field">
                      <span>Assigned to</span>
                      {canManage ? (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                        <label className="field" style={{ flex: "1 1 260px" }}>
                          <span>Select operative</span>
                          <select className="input" onChange={(event) => setSelectedOperativeId(event.target.value)} value={selectedOperativeId}>
                            <option value="">Choose a team member</option>
                            {operativeOptions.map((user) => (
                              <option key={user.id} value={user.id}>{user.fullName}</option>
                            ))}
                          </select>
                        </label>
                        <button className="button button-subtle" onClick={addOperative} type="button">Assign Across Job</button>
                      </div>
                      ) : null}
                      {overlapWarnings.length > 0 ? (
                        <div className="error-banner">
                          {overlapWarnings.map((warning) => (
                            <div key={`${warning.day}-${warning.userId}-${warning.companyJobNumber}`}>
                              {warning.userName} overlaps with {warning.companyJobNumber} ({warning.jobTitle}) on {new Date(`${warning.day}T00:00:00`).toLocaleDateString()}.
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="stack">
                        {form.scheduledDays.map((day) => (
                          <div key={day} className="panel" style={{ padding: 16 }}>
                            <div style={{ fontWeight: 700, marginBottom: 10 }}>{new Date(`${day}T00:00:00`).toLocaleDateString()}</div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {(form.dailyAssignments[day] ?? []).length === 0 ? <div className="muted">Unassigned</div> : null}
                              {(form.dailyAssignments[day] ?? []).map((userId) => (
                                <div key={`${day}-${userId}`} className="assignment-pill">
                                  <span>{usersById.get(userId)?.fullName ?? userId}</span>
                                  {canManage ? <button className="assignment-pill-remove" onClick={() => removeOperative(day, userId)} type="button">Remove</button> : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {canManage ? <button className="button" onClick={handleSave} type="button">Save Schedule</button> : null}
                  </div>
                  <div className="panel" style={{ padding: 20 }}>
                    <div className="stack">
                      <div>
                        <div className="muted">Current assignment</div>
                        <div style={{ fontWeight: 700 }}>
                          {form.scheduledDays.flatMap((day) => form.dailyAssignments[day] ?? []).length > 0
                            ? [...new Set(form.scheduledDays.flatMap((day) => form.dailyAssignments[day] ?? []))].map((userId) => usersById.get(userId)?.fullName ?? userId).join(", ")
                            : "No operatives assigned"}
                        </div>
                      </div>
                      <div>
                        <div className="muted">Scheduled dates</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {form.scheduledDays.map((day) => (
                            <div key={day}>{new Date(`${day}T00:00:00`).toLocaleDateString()}</div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="muted">Tasks</div>
                        <div className="stack" style={{ gap: 10 }}>
                          {(job?.tasks ?? []).map((task) => (
                            <div key={task.id} className="panel" style={{ padding: 12 }}>
                              <div style={{ fontWeight: 700 }}>{task.title}</div>
                              <div className="muted">{task.status}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}}
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
                              href={jobDetailHref(job.id, "schedule")}
                              style={getJobVisualStyle(job, hasJobConflict(job, jobs, dayKey, user.id))}
                            >
                              <div className="schedule-job-chip-code">{job.companyJobNumber}</div>
                              <div className="schedule-job-chip-title">{job.title}</div>
                              <div className="schedule-job-chip-title">
                                {job.scheduledStartTime && job.scheduledEndTime ? `${job.scheduledStartTime}-${job.scheduledEndTime}` : "Time TBC"}
                              </div>
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
                      <Link href={jobDetailHref(job.id)}>
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
                              href={jobDetailHref(job.id, "schedule")}
                              style={getJobVisualStyle(job, hasJobConflict(job, jobs, dayKey))}
                              title={`${job.companyJobNumber} - ${job.title}${job.scheduledStartTime && job.scheduledEndTime ? ` (${job.scheduledStartTime}-${job.scheduledEndTime})` : ""}`}
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
  const [showCreate, setShowCreate] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    email: string;
    fullName: string;
    phone: string;
    role: string;
    password: string;
  }>({
    email: "",
    fullName: "",
    phone: "",
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
      phone: "",
      role: ROLE_VALUES[1],
      password: ""
    });
    setEditingUserId(null);
    setShowCreate(false);
  }

  function startEdit(user: UserRecord) {
    setEditingUserId(user.id);
    setShowCreate(true);
    setForm({
      email: user.email,
      fullName: user.fullName,
      phone: user.phone ?? "",
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
        phone: form.phone,
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
      {(session) => {
        const canManage = canManageWorkspace(session.user.role);
        return (
        <div className="stack">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div className="muted">
              {canManage ? "Current employees and their readiness status." : "People you are scheduled to work with."}
            </div>
            {canManage ? (
              <button className="button" onClick={() => setShowCreate((current) => !current)} type="button">
                {showCreate ? "Close Create User" : "Create User"}
              </button>
            ) : null}
          </div>
          {showCreate && canManage ? (
            <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>{editingUserId ? "Edit user" : "Create user"}</h2>
            <form className="stack" onSubmit={handleSubmit}>
              <TextField label="Email" onChange={(value) => setForm((current) => ({ ...current, email: value }))} type="email" value={form.email} />
              <TextField label="Full name" onChange={(value) => setForm((current) => ({ ...current, fullName: value }))} value={form.fullName} />
              <TextField label="Phone" onChange={(value) => setForm((current) => ({ ...current, phone: value }))} value={form.phone} />
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
          ) : null}
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Current employees</h2>
            <div className="stack">
              {users.map((user) => (
                <Link
                  key={user.id}
                  className="button button-subtle"
                  href={userDetailHref(user.id)}
                  style={{
                    justifyContent: "space-between",
                    width: "100%",
                    borderRadius: 18,
                    padding: 16,
                    background: getTrainingState(user) === "expired"
                      ? "rgba(251, 113, 133, 0.16)"
                      : getTrainingState(user) === "warning"
                        ? "rgba(251, 191, 36, 0.18)"
                        : undefined
                  }}
                >
                  <span style={{ display: "grid", gap: 6, textAlign: "left" }}>
                    <span style={{ fontWeight: 700 }}>{user.fullName}</span>
                    <span className="muted">{user.email} - {user.role} - {user.accountStatus ?? "ACTIVE"}</span>
                  </span>
                  <span>
                    {getTrainingState(user) === "expired"
                      ? "Expired Training"
                      : getTrainingState(user) === "warning"
                        ? "Training Warning"
                        : canManage ? "Open" : "View"}
                  </span>
                </Link>
              ))}
            </div>
          </article>
        </div>
      )}}
    </ProtectedWorkspace>
  );
}

export function UserRecordPage({
  initialTab = "information",
  userId
}: Readonly<{
  initialTab?: "schedule" | "information" | "training" | "settings";
  userId: string;
}>) {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"schedule" | "information" | "training" | "settings">(initialTab);
  const [scheduleMode, setScheduleMode] = useState<"week" | "month">("week");
  const [weekFocusDate, setWeekFocusDate] = useState(() => toDateKey(new Date()));
  const [scheduleMonth, setScheduleMonth] = useState(() => {
    const current = new Date();
    return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  });
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [uploadingRecordId, setUploadingRecordId] = useState<string | null>(null);
  const [openingRecordId, setOpeningRecordId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    email: string;
    fullName: string;
    phone: string;
    role: string;
    password: string;
    accountStatus: string;
  }>({
    email: "",
    fullName: "",
    phone: "",
    role: ROLE_VALUES[1],
    password: "",
    accountStatus: "ACTIVE"
  });

  async function load() {
    try {
      const [nextUser, nextJobs] = await Promise.all([
        apiRequest<UserRecord>(`users/${userId}`),
        apiRequest<JobRecord[]>("jobs")
      ]);
      setUser(nextUser);
      setJobs(nextJobs);
      setForm({
        email: nextUser.email,
        fullName: nextUser.fullName,
        phone: nextUser.phone ?? "",
        role: nextUser.role,
        password: "",
        accountStatus: nextUser.accountStatus ?? "ACTIVE"
      });
      setTrainingRecords(parseTrainingRecords(nextUser.trainingRecordsJson));
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load employee.");
    }
  }

  useEffect(() => {
    void load();
  }, [userId]);

  async function handleSave() {
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        email: form.email,
        fullName: form.fullName,
        phone: form.phone,
        role: form.role,
        accountStatus: form.accountStatus,
        trainingRecordsJson: JSON.stringify(trainingRecords),
        ...(form.password ? { password: form.password } : {})
      };
      await apiRequest(`users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) });
      setSuccess("Employee updated successfully.");
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to save employee.");
    }
  }

  const assignedJobs = jobs
    .filter((job) => Object.values(getJobDailyAssignments(job)).some((assignedUsers) => assignedUsers.includes(userId)))
    .sort((left, right) => (left.scheduledDays[0] ?? "").localeCompare(right.scheduledDays[0] ?? ""));
  const weekStart = startOfWeek(new Date(`${weekFocusDate}T00:00:00`));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });
  const [scheduleYear, scheduleMonthNumber] = scheduleMonth.split("-").map(Number);
  const monthDays = Array.from({ length: new Date(scheduleYear, scheduleMonthNumber, 0).getDate() }, (_, index) => index + 1);
  const monthStart = new Date(scheduleYear, scheduleMonthNumber - 1, 1);
  const monthEnd = new Date(scheduleYear, scheduleMonthNumber - 1, monthDays.length, 23, 59, 59, 999);
  const assignedJobsForMonth = assignedJobs.filter((job) => (job.scheduledDays ?? []).some((day) => {
    const current = new Date(`${day}T00:00:00`);
    return current >= monthStart && current <= monthEnd;
  }));

  const demoProfileRows = [
    { label: "Mobile", value: form.phone || (user ? `07${user.id.slice(0, 2)} ${user.id.slice(2, 5)} ${user.id.slice(5, 9)}` : "-") },
    { label: "Depot", value: user?.role === "OPERATIVE" ? "Midlands Depot" : "Head Office" },
    { label: "Manager", value: user?.role === "OPERATIVE" ? "Marcus Cole" : "Alicia Warren" },
    { label: "Employment", value: user?.role === "OPERATIVE" ? "Full-time field operative" : "Management" }
  ];

  function updateTrainingRecord(recordId: string, patch: Partial<TrainingRecord>) {
    setTrainingRecords((current) => current.map((record) => (
      record.id === recordId ? { ...record, ...patch } : record
    )));
  }

  function addTrainingRecord() {
    setTrainingRecords((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: "New Certificate",
        expiresOn: "",
        certificateFileName: ""
      }
    ]);
  }

  function removeTrainingRecord(recordId: string) {
    setTrainingRecords((current) => current.filter((record) => record.id !== recordId));
  }

  async function handleTrainingFile(recordId: string, file: File | null) {
    if (!file) {
      return;
    }

    setUploadingRecordId(recordId);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      const uploaded = await apiRequest<TrainingRecord>(`users/${userId}/training-records/${recordId}/certificate`, {
        method: "POST",
        body: formData
      });
      updateTrainingRecord(recordId, uploaded);
      setSuccess("Certificate uploaded successfully.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to upload certificate.");
    } finally {
      setUploadingRecordId(null);
    }
  }

  async function handleOpenTrainingCertificate(record: TrainingRecord) {
    setOpeningRecordId(record.id);
    setError(null);

    try {
      await openProtectedFile(
        `users/${userId}/training-records/${record.id}/certificate`,
        record.certificateFileName ?? `${record.name || "certificate"}.bin`
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to open certificate.");
    } finally {
      setOpeningRecordId(null);
    }
  }

  async function setAccountStatus(status: "ACTIVE" | "SUSPENDED" | "DISABLED") {
    setForm((current) => ({ ...current, accountStatus: status }));
    try {
      await apiRequest(`users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          accountStatus: status,
          trainingRecordsJson: JSON.stringify(trainingRecords)
        })
      });
      setSuccess(status === "ACTIVE" ? "Account enabled." : "Account status updated.");
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to update account status.");
    }
  }

  return (
    <ProtectedWorkspace allow="tenant" description="Review a team member, their schedule, training, and account settings." title={user ? user.fullName : "Team Member"}>
      {(session) => {
        const canManage = canManageWorkspace(session.user.role);
        return (
        <div className="stack">
          <ErrorText error={error} />
          {success ? <div className="panel" style={{ padding: 18, borderRadius: 18 }}>{success}</div> : null}
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
              {[
                { key: "schedule" as const, label: "Schedule" },
                { key: "information" as const, label: "Employee Information" },
                { key: "training" as const, label: "Training" },
                { key: "settings" as const, label: "Settings" }
              ].map((tab) => (
                <button
                  key={tab.key}
                  className={activeTab === tab.key ? "button" : "button button-subtle"}
                  onClick={() => setActiveTab(tab.key)}
                  style={{ borderRadius: 0, minWidth: 170 }}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div style={{ padding: 24 }}>
              {activeTab === "schedule" ? (
                <div className="stack">
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between", alignItems: "end" }}>
                    <div className="field" style={{ minWidth: 280 }}>
                      <span>Schedule view</span>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className={scheduleMode === "week" ? "button" : "button button-subtle"} onClick={() => setScheduleMode("week")} type="button">
                          Week Planner
                        </button>
                        <button className={scheduleMode === "month" ? "button" : "button button-subtle"} onClick={() => setScheduleMode("month")} type="button">
                          Month Jobs
                        </button>
                      </div>
                    </div>
                    {scheduleMode === "week" ? (
                      <div className="field" style={{ minWidth: 320 }}>
                        <span>Week of</span>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button className="button button-subtle" onClick={() => setWeekFocusDate(shiftDateKey(weekFocusDate, -7))} type="button">Previous</button>
                          <input className="input" onChange={(event) => setWeekFocusDate(event.target.value)} type="date" value={weekFocusDate} />
                          <button className="button button-subtle" onClick={() => setWeekFocusDate(shiftDateKey(weekFocusDate, 7))} type="button">Next</button>
                        </div>
                      </div>
                    ) : (
                      <label className="field" style={{ minWidth: 220 }}>
                        <span>Calendar month</span>
                        <input className="input" onChange={(event) => setScheduleMonth(event.target.value)} type="month" value={scheduleMonth} />
                      </label>
                    )}
                  </div>

                  {scheduleMode === "week" ? (
                    <div className="schedule-board-wrap">
                      <div className="schedule-board">
                        <div className="schedule-board-corner">
                          <div style={{ fontWeight: 800 }}>{user?.fullName ?? "Employee"}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {weekDays[0].toLocaleDateString()} - {weekDays[weekDays.length - 1].toLocaleDateString()}
                          </div>
                        </div>
                        {weekDays.map((day) => (
                          <div key={day.toISOString()} className={`schedule-board-header ${day.getDay() === 0 || day.getDay() === 6 ? "schedule-board-header-weekend" : ""}`}>
                            <div>{day.toLocaleDateString(undefined, { weekday: "short" })}</div>
                            <div>{day.getDate()}</div>
                          </div>
                        ))}
                        <div className="schedule-board-user">
                          <div className="schedule-board-user-name">{user?.fullName ?? "-"}</div>
                          <div className="schedule-board-user-role">{user?.role ?? "-"}</div>
                        </div>
                        {weekDays.map((day) => {
                          const dayKey = toDateKey(day);
                          const dayJobs = assignedJobs.filter((job) => getAssignedUsersForDay(job, dayKey).includes(userId));
                          return (
                            <div key={dayKey} className={`schedule-board-cell ${day.getDay() === 0 || day.getDay() === 6 ? "schedule-board-cell-weekend" : ""}`}>
                              {dayJobs.length === 0 ? <div className="schedule-board-empty">-</div> : null}
                              {dayJobs.map((job) => (
                                <Link
                                  key={job.id}
                                  className="schedule-job-chip"
                                  href={jobDetailHref(job.id, "schedule")}
                                  style={getJobVisualStyle(job, hasJobConflict(job, jobs, dayKey, userId))}
                                >
                                  <div className="schedule-job-chip-code">{job.companyJobNumber}</div>
                                  <div className="schedule-job-chip-title">{job.title}</div>
                                  <div className="schedule-job-chip-title">
                                    {job.scheduledStartTime && job.scheduledEndTime ? `${job.scheduledStartTime}-${job.scheduledEndTime}` : "Time TBC"}
                                  </div>
                                </Link>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="jobs-board-wrap">
                      <div className="jobs-board" style={{ gridTemplateColumns: `240px repeat(${monthDays.length}, minmax(28px, 1fr))` }}>
                        <div className="jobs-board-corner">
                          <div style={{ fontWeight: 800 }}>{user?.fullName ?? "Employee"} Jobs</div>
                          <div className="muted" style={{ fontSize: 12 }}>{monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
                        </div>
                        {monthDays.map((day) => {
                          const current = new Date(scheduleYear, scheduleMonthNumber - 1, day);
                          const weekend = current.getDay() === 0 || current.getDay() === 6;
                          return <div key={day} className={`jobs-board-header ${weekend ? "jobs-board-header-weekend" : ""}`}>{day}</div>;
                        })}
                        {assignedJobsForMonth.length === 0 ? (
                          <Fragment>
                            <div className="jobs-board-job">
                              <div className="jobs-board-job-code">No jobs</div>
                              <div className="jobs-board-job-title">Nothing assigned this month</div>
                            </div>
                            {monthDays.map((day) => {
                              const current = new Date(scheduleYear, scheduleMonthNumber - 1, day);
                              const weekend = current.getDay() === 0 || current.getDay() === 6;
                              return <div key={`empty-${day}`} className={`jobs-board-cell ${weekend ? "jobs-board-cell-weekend" : ""}`} />;
                            })}
                          </Fragment>
                        ) : null}
                        {assignedJobsForMonth.map((job) => (
                          <Fragment key={job.id}>
                            <div className="jobs-board-job">
                              <Link href={jobDetailHref(job.id, "schedule")}>
                                <div className="jobs-board-job-code">{job.companyJobNumber}</div>
                                <div className="jobs-board-job-title">{job.title}</div>
                              </Link>
                            </div>
                            {monthDays.map((day) => {
                              const dayKey = `${scheduleYear}-${String(scheduleMonthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                              const current = new Date(scheduleYear, scheduleMonthNumber - 1, day);
                              const weekend = current.getDay() === 0 || current.getDay() === 6;
                              const scheduled = getAssignedUsersForDay(job, dayKey).includes(userId);
                              return (
                                <div key={`${job.id}-${dayKey}`} className={`jobs-board-cell ${weekend ? "jobs-board-cell-weekend" : ""}`}>
                                  {scheduled ? (
                                    <Link
                                      className="jobs-board-chip"
                                      href={jobDetailHref(job.id, "schedule")}
                                      style={getJobVisualStyle(job, hasJobConflict(job, jobs, dayKey, userId))}
                                      title={`${job.companyJobNumber} - ${job.title}${job.scheduledStartTime && job.scheduledEndTime ? ` (${job.scheduledStartTime}-${job.scheduledEndTime})` : ""}`}
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

                  <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 24 }}>
                    <div className="panel" style={{ padding: 20 }}>
                      <div style={{ fontWeight: 800, marginBottom: 12 }}>Assigned work</div>
                      <div className="stack" style={{ gap: 12 }}>
                        {assignedJobs.length === 0 ? <div className="muted">No assigned jobs.</div> : null}
                        {assignedJobs.map((job) => (
                          <Link key={job.id} className="panel" href={jobDetailHref(job.id, "schedule")} style={{ padding: 16 }}>
                            <div style={{ fontWeight: 700 }}>{job.companyJobNumber}</div>
                            <div className="muted">{job.title}</div>
                            <div className="muted">
                              {(job.scheduledDays ?? []).filter((day) => getAssignedUsersForDay(job, day).includes(userId)).map((day) => new Date(`${day}T00:00:00`).toLocaleDateString()).join(", ")}
                            </div>
                            <div className="muted">{job.scheduledStartTime && job.scheduledEndTime ? `${job.scheduledStartTime} - ${job.scheduledEndTime}` : "Time TBC"}</div>
                          </Link>
                        ))}
                      </div>
                    </div>
                    <div className="panel" style={{ padding: 20 }}>
                      <div style={{ fontWeight: 800, marginBottom: 12 }}>Rough availability</div>
                      <div className="stack" style={{ gap: 12 }}>
                        <div className="callout"><strong>Normal shift:</strong> 08:00 - 17:00</div>
                        <div className="callout"><strong>Base:</strong> Midlands Region</div>
                        <div className="callout"><strong>This week:</strong> {assignedJobs.filter((job) => weekDays.some((day) => getAssignedUsersForDay(job, toDateKey(day)).includes(userId))).length} active booking(s)</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "information" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 24 }}>
                  <div className="stack">
                    {canManage ? (
                      <>
                        <TextField label="Full name" onChange={(value) => setForm((current) => ({ ...current, fullName: value }))} value={form.fullName} />
                        <TextField label="Email" onChange={(value) => setForm((current) => ({ ...current, email: value }))} type="email" value={form.email} />
                        <TextField label="Phone number" onChange={(value) => setForm((current) => ({ ...current, phone: value }))} value={form.phone} />
                        <SelectField label="Role" onChange={(value) => setForm((current) => ({ ...current, role: value }))} options={[...ROLE_VALUES]} value={form.role} />
                        <button className="button" onClick={handleSave} type="button">Save Employee Information</button>
                      </>
                    ) : null}
                    {demoProfileRows.map((row) => (
                      <div key={row.label} className="panel" style={{ padding: 16 }}>
                        <div className="muted">{row.label}</div>
                        <div style={{ marginTop: 6, fontWeight: 700 }}>{row.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="panel" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 12 }}>Profile summary</div>
                    <div className="stack" style={{ gap: 10 }}>
                      <div><strong>Name:</strong> {form.fullName || "-"}</div>
                      <div><strong>Email:</strong> {form.email || "-"}</div>
                      <div><strong>Phone:</strong> {form.phone || "-"}</div>
                      <div><strong>Role:</strong> {form.role || "-"}</div>
                      <div><strong>Status:</strong> {form.accountStatus || "ACTIVE"}</div>
                      <div><strong>Employment started:</strong> 12/01/2024</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "training" ? (
                <div className="stack">
                  <div className="panel" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 12 }}>Training and certifications</div>
                    <div className="stack" style={{ gap: 12 }}>
                      {trainingRecords.map((record) => (
                        <div key={record.id} className="panel" style={{ padding: 14 }}>
                          <div style={{ display: "grid", gap: 12 }}>
                            {canManage ? (
                              <>
                                <TextField label="Training name" onChange={(value) => updateTrainingRecord(record.id, { name: value })} value={record.name} />
                                <TextField label="Expiry date" onChange={(value) => updateTrainingRecord(record.id, { expiresOn: value })} type="date" value={record.expiresOn} />
                                <label className="field">
                                  <span>Certificate PDF/Image</span>
                                  <input
                                    className="input"
                                    onChange={(event) => void handleTrainingFile(record.id, event.target.files?.[0] ?? null)}
                                    type="file"
                                  />
                                </label>
                              </>
                            ) : (
                              <>
                                <div><strong>{record.name}</strong></div>
                                <div className="muted">Expiry: {record.expiresOn || "Not set"}</div>
                              </>
                            )}
                            <div className="muted">{record.certificateFileName ? `Stored: ${record.certificateFileName}` : "No certificate selected."}</div>
                            {canManage && record.certificateDocumentId ? (
                              <div style={{ display: "grid", gap: 10 }}>
                                <button
                                  className="button button-subtle"
                                  disabled={openingRecordId === record.id}
                                  onClick={() => void handleOpenTrainingCertificate(record)}
                                  type="button"
                                >
                                  Open certificate
                                </button>
                              </div>
                            ) : null}
                            {canManage ? (
                              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <button className="button button-subtle" disabled={uploadingRecordId === record.id} onClick={() => removeTrainingRecord(record.id)} type="button">Remove Record</button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      {canManage ? <button className="button button-subtle" onClick={addTrainingRecord} type="button">Add Training Record</button> : null}
                      {canManage ? <button className="button" onClick={handleSave} type="button">Save Training</button> : null}
                    </div>
                  </div>
                  <div className="panel" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 12 }}>Next recommended training</div>
                    <div className="callout">Emergency First Aid refresher due next quarter.</div>
                  </div>
                </div>
              ) : null}

              {activeTab === "settings" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 24 }}>
                  <div className="stack">
                    {canManage ? (
                      <>
                        <TextField label="Email" onChange={(value) => setForm((current) => ({ ...current, email: value }))} type="email" value={form.email} />
                        <TextField label="Full name" onChange={(value) => setForm((current) => ({ ...current, fullName: value }))} value={form.fullName} />
                        <TextField label="Phone number" onChange={(value) => setForm((current) => ({ ...current, phone: value }))} value={form.phone} />
                        <SelectField label="Role" onChange={(value) => setForm((current) => ({ ...current, role: value }))} options={[...ROLE_VALUES]} value={form.role} />
                        <SelectField label="Account status" onChange={(value) => setForm((current) => ({ ...current, accountStatus: value }))} options={["ACTIVE", "SUSPENDED", "DISABLED"]} value={form.accountStatus} />
                        <TextField label="New password (optional)" onChange={(value) => setForm((current) => ({ ...current, password: value }))} type="password" value={form.password} />
                        <button className="button" onClick={handleSave} type="button">Save Settings</button>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button className="button button-subtle" onClick={() => void setAccountStatus("SUSPENDED")} type="button">Suspend Account</button>
                          <button className="button button-danger" onClick={() => void setAccountStatus("DISABLED")} type="button">Deactivate Account</button>
                          <button className="button" onClick={() => void setAccountStatus("ACTIVE")} type="button">Enable Account</button>
                        </div>
                      </>
                    ) : (
                      <div className="callout">Only managers can change employee settings.</div>
                    )}
                  </div>
                  <div className="panel" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 12 }}>Account notes</div>
                    <div className="stack" style={{ gap: 12 }}>
                      <div className="callout">Use this area after first setup for role changes and password resets only.</div>
                      <div className="callout">Operational planning should happen from Schedule and Jobs, not here.</div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}}
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
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);

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

  async function handleOpenDocument(documentId: string, documentName: string) {
    setOpeningDocumentId(documentId);
    try {
      await openProtectedFile(`documents/${documentId}/download`, documentName);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to open document.");
    } finally {
      setOpeningDocumentId(null);
    }
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
                  <button
                    className="button button-subtle"
                    disabled={openingDocumentId === String(document.id)}
                    onClick={() => void handleOpenDocument(String(document.id), String(document.name))}
                    style={{ marginTop: 10 }}
                    type="button"
                  >
                    Open Document
                  </button>
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
