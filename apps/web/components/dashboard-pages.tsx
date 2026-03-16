"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import { ProtectedWorkspace } from "./protected-workspace";
import { apiRequest } from "../lib/api";
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
  openCompliance: number;
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
  assignedOperativeIds: string[];
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
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const current = new Date();
    return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  });
  const [form, setForm] = useState<{
    title: string;
    companyJobNumber: string;
    customerJobNumber: string;
    siteAddress: string;
    status: string;
    scheduledFor: string;
    assignedOperativeIds: string[];
  }>({
    title: "",
    companyJobNumber: "",
    customerJobNumber: "",
    siteAddress: "",
    status: JOB_STATUS_VALUES[1],
    scheduledFor: "",
    assignedOperativeIds: [] as string[]
  });

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

  useEffect(() => { void load(); }, []);

  const [year, month] = calendarMonth.split("-").map((part) => Number(part));
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const jobsForMonth = jobs.filter((job) => {
    if (!job.scheduledFor) {
      return false;
    }

    const scheduled = new Date(job.scheduledFor);
    return scheduled.getFullYear() === year && scheduled.getMonth() + 1 === month;
  });

  function toggleOperative(userId: string) {
    setForm((current) => ({
      ...current,
      assignedOperativeIds: current.assignedOperativeIds.includes(userId)
        ? current.assignedOperativeIds.filter((id) => id !== userId)
        : [...current.assignedOperativeIds, userId]
    }));
  }

  function resetForm() {
    setForm({
      title: "",
      companyJobNumber: "",
      customerJobNumber: "",
      siteAddress: "",
      status: JOB_STATUS_VALUES[1],
      scheduledFor: "",
      assignedOperativeIds: []
    });
    setEditingJobId(null);
  }

  function startEdit(job: JobRecord) {
    setEditingJobId(job.id);
    setForm({
      title: job.title,
      companyJobNumber: job.companyJobNumber,
      customerJobNumber: job.customerJobNumber,
      siteAddress: job.siteAddress,
      status: job.status,
      scheduledFor: job.scheduledFor ? new Date(job.scheduledFor).toISOString().slice(0, 16) : "",
      assignedOperativeIds: job.assignedOperativeIds ?? []
    });
  }

  function jobsForUserOnDay(userId: string, day: number) {
    return jobsForMonth.filter((job) => {
      if (!job.scheduledFor || !(job.assignedOperativeIds ?? []).includes(userId)) {
        return false;
      }

      return new Date(job.scheduledFor).getDate() === day;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingJobId) {
      await apiRequest(`jobs/${editingJobId}`, { method: "PATCH", body: JSON.stringify(form) });
    } else {
      await apiRequest("jobs", { method: "POST", body: JSON.stringify(form) });
    }
    resetForm();
    await load();
  }

  return (
    <ProtectedWorkspace allow="tenant" description="Create and track operational jobs across sites." title="Jobs">
      {() => (
        <div className="stack">
          <article className="panel" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0 }}>Job calendar</h2>
                <div className="muted" style={{ marginTop: 8 }}>Assignments by employee and day for the selected month.</div>
              </div>
              <label className="field" style={{ minWidth: 220 }}>
                <span>Calendar month</span>
                <input className="input" onChange={(event) => setCalendarMonth(event.target.value)} type="month" value={calendarMonth} />
              </label>
            </div>
            <div className="calendar-wrap" style={{ marginTop: 20 }}>
              <div className="jobs-calendar">
                <div className="calendar-corner">Employee</div>
                {monthDays.map((day) => (
                  <div key={day} className="calendar-head">{day}</div>
                ))}
                {users.map((user) => (
                  <Fragment key={user.id}>
                    <div className="calendar-name">{user.fullName}</div>
                    {monthDays.map((day) => {
                      const assignedJobs = jobsForUserOnDay(user.id, day);
                      return (
                        <div key={`${user.id}-${day}`} className="calendar-cell">
                          {assignedJobs.map((job) => (
                            <button
                              key={job.id}
                              className="calendar-job"
                              onClick={() => startEdit(job)}
                              type="button"
                            >
                              {job.companyJobNumber}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </article>

          <PanelGrid>
            <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>{editingJobId ? "Edit job" : "Create job"}</h2>
            <form className="stack" onSubmit={handleSubmit}>
              <TextField label="Title" onChange={(value) => setForm((current) => ({ ...current, title: value }))} value={form.title} />
              <TextField label="Company job number" onChange={(value) => setForm((current) => ({ ...current, companyJobNumber: value }))} value={form.companyJobNumber} />
              <TextField label="Customer job number" onChange={(value) => setForm((current) => ({ ...current, customerJobNumber: value }))} value={form.customerJobNumber} />
              <TextField label="Site address" onChange={(value) => setForm((current) => ({ ...current, siteAddress: value }))} value={form.siteAddress} />
              <SelectField label="Status" onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[...JOB_STATUS_VALUES]} value={form.status} />
              <TextField label="Scheduled for" onChange={(value) => setForm((current) => ({ ...current, scheduledFor: value }))} type="datetime-local" value={form.scheduledFor} />
              <div className="field">
                <span>Assign operatives</span>
                <div className="stack" style={{ gap: 10 }}>
                  {users.map((user) => (
                    <label key={String(user.id)} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input
                        checked={form.assignedOperativeIds.includes(String(user.id))}
                        onChange={() => toggleOperative(String(user.id))}
                        type="checkbox"
                      />
                      <span>{String(user.fullName)} ({String(user.role)})</span>
                    </label>
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
                    Scheduled: {job.scheduledFor ? new Date(job.scheduledFor).toLocaleString() : "Not scheduled"}
                  </div>
                  <div className="muted">
                    Assigned: {job.assignedOperativeIds.length > 0
                      ? job.assignedOperativeIds.map((id) => usersById.get(id)?.fullName ?? id).join(", ")
                      : "Unassigned"}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </PanelGrid>
        </div>
      )}
    </ProtectedWorkspace>
  );
}

export function UsersPage() {
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
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
      setUsers(await apiRequest<Array<Record<string, unknown>>>("users"));
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load users.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiRequest("users", { method: "POST", body: JSON.stringify(form) });
    setForm({
      email: "",
      fullName: "",
      role: ROLE_VALUES[1],
      password: ""
    });
    await load();
  }

  return (
    <ProtectedWorkspace allow="tenant" description="Manage company users and role access." title="Team">
      {() => (
        <PanelGrid>
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Create user</h2>
            <form className="stack" onSubmit={handleSubmit}>
              <TextField label="Email" onChange={(value) => setForm((current) => ({ ...current, email: value }))} type="email" value={form.email} />
              <TextField label="Full name" onChange={(value) => setForm((current) => ({ ...current, fullName: value }))} value={form.fullName} />
              <SelectField label="Role" onChange={(value) => setForm((current) => ({ ...current, role: value }))} options={[...ROLE_VALUES]} value={form.role} />
              <TextField label="Password" onChange={(value) => setForm((current) => ({ ...current, password: value }))} type="password" value={form.password} />
              <button className="button" type="submit">Create User</button>
            </form>
            <ErrorText error={error} />
          </article>
          <article className="panel" style={{ padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Current users</h2>
            <div className="stack">
              {users.map((user) => (
                <div key={String(user.id)} style={{ paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                  <div style={{ fontWeight: 700 }}>{String(user.fullName)}</div>
                  <div className="muted">{String(user.email)} - {String(user.role)}</div>
                </div>
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
  const [summary, setSummary] = useState<{ jobs: number; completedJobs: number; openCompliance: number; activeUsers: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ jobs: number; completedJobs: number; openCompliance: number; activeUsers: number }>("reporting/summary")
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
              { label: "Open Actions", value: summary?.openCompliance ?? 0 },
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
