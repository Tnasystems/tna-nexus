"use client";

import { ChangeEvent, FormEvent, Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedWorkspace } from "./protected-workspace";
import { apiRequest, apiRequestBlob } from "../lib/api";
import { buildSession, persistSession, type AppSession, type AuthTokenResponse } from "../lib/auth";
import { applyThemePreference, persistThemePreference, readThemePreference, type ThemePreference } from "../lib/theme";
import { JOB_STATUS_VALUES, ROLE_VALUES } from "@tna-nexus/shared";

function PanelGrid({ children }: Readonly<{ children: React.ReactNode }>) {
  return <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>{children}</section>;
}

function ScrollList({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxHeight: 246,
        overflowY: "auto",
        paddingRight: 6
      }}
    >
      {children}
    </div>
  );
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
  externalInfo?: string | null;
  internalInfo?: string | null;
  status: string;
  quoteStatus?: string | null;
  quotationJson?: string | null;
  quotationRevisionsJson?: string | null;
  finalMeasureJson?: string | null;
  scheduledFor: string | null;
  scheduledTo: string | null;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  scheduledDays: string[];
  dailyAssignmentsJson: string;
  assignedOperativeIds: string[];
  assignedVehicleIds: string[];
  tasks?: Array<{ id: string; title: string; status: string }>;
}

interface AssetRecord {
  id: string;
  name: string;
  serialNumber: string;
  kind?: string | null;
  assetStatus?: string | null;
  registrationNumber?: string | null;
  notes?: string | null;
  lastServicedAt?: string | null;
  nextServiceDueAt?: string | null;
  updatedAt?: string | null;
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

function getScheduledDaysForJob(job: JobRecord) {
  if ((job.scheduledDays ?? []).length > 0) {
    return [...job.scheduledDays].sort();
  }

  if (!job.scheduledFor) {
    return [];
  }

  return [new Date(job.scheduledFor).toISOString().slice(0, 10)];
}

function jobDetailHref(jobId: string, tab: "details" | "external" | "internal" | "schedule" | "quotation" = "details") {
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

interface JobDocumentRecord {
  id: string;
  name: string;
  mimeType: string;
  visibility?: string | null;
  createdAt?: string;
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

interface QuoteLineItem {
  id: string;
  sourceItemId?: string;
  code?: string;
  title: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

interface ContractRecord {
  id: string;
  name: string;
  code: string;
  description?: string;
}

interface QuoteCatalogItemRecord {
  id: string;
  name: string;
  code: string;
  description: string;
  unit: string;
  defaultRate: string;
  contractRates: Record<string, string>;
}

interface QuotationRevision {
  id: string;
  label: string;
  createdAt: string;
  contractId: string;
  reference: string;
  scope: string;
  exclusions: string;
  assumptions: string;
  note: string;
  totalAmount: string;
  items: QuoteLineItem[];
}

interface QuotationRecord {
  contractId: string;
  reference: string;
  scope: string;
  exclusions: string;
  assumptions: string;
  totalAmount: string;
  revisionNotes: string;
  items: QuoteLineItem[];
}

interface FinalMeasureRecord {
  measuredBy: string;
  measuredOn: string;
  summary: string;
  totalMeasuredValue: string;
}

function createEmptyQuoteItem(): QuoteLineItem {
  return {
    id: crypto.randomUUID(),
    sourceItemId: "",
    code: "",
    title: "",
    description: "",
    quantity: "1",
    unit: "item",
    unitPrice: "0.00"
  };
}

function createEmptyQuotation(): QuotationRecord {
  return {
    contractId: "",
    reference: "",
    scope: "",
    exclusions: "",
    assumptions: "",
    totalAmount: "",
    revisionNotes: "",
    items: [createEmptyQuoteItem()]
  };
}

function createEmptyFinalMeasure(): FinalMeasureRecord {
  return {
    measuredBy: "",
    measuredOn: "",
    summary: "",
    totalMeasuredValue: ""
  };
}

function parseJsonObject<T>(value: string | null | undefined, fallback: T) {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function parseQuotation(value: string | null | undefined) {
  const parsed = parseJsonObject<Partial<QuotationRecord>>(value, {});
  const items = Array.isArray(parsed.items) && parsed.items.length > 0
    ? parsed.items.map((item) => ({
      id: typeof item?.id === "string" && item.id ? item.id : crypto.randomUUID(),
      sourceItemId: typeof item?.sourceItemId === "string" ? item.sourceItemId : "",
      code: typeof item?.code === "string" ? item.code : "",
      title: typeof item?.title === "string" ? item.title : "",
      description: typeof item?.description === "string" ? item.description : "",
      quantity: typeof item?.quantity === "string" ? item.quantity : "1",
      unit: typeof item?.unit === "string" ? item.unit : "item",
      unitPrice: typeof item?.unitPrice === "string" ? item.unitPrice : "0.00"
    }))
    : [createEmptyQuoteItem()];

  return {
    ...createEmptyQuotation(),
    ...parsed,
    items
  };
}

function parseQuotationRevisions(value: string | null | undefined) {
  const parsed = parseJsonObject<QuotationRevision[]>(value, []);
  return Array.isArray(parsed)
    ? parsed.map((revision) => ({
      id: typeof revision?.id === "string" && revision.id ? revision.id : crypto.randomUUID(),
      label: typeof revision?.label === "string" ? revision.label : "Revision",
      createdAt: typeof revision?.createdAt === "string" ? revision.createdAt : new Date().toISOString(),
      contractId: typeof revision?.contractId === "string" ? revision.contractId : "",
      reference: typeof revision?.reference === "string" ? revision.reference : "",
      scope: typeof revision?.scope === "string" ? revision.scope : "",
      exclusions: typeof revision?.exclusions === "string" ? revision.exclusions : "",
      assumptions: typeof revision?.assumptions === "string" ? revision.assumptions : "",
      note: typeof revision?.note === "string" ? revision.note : "",
      totalAmount: typeof revision?.totalAmount === "string" ? revision.totalAmount : "",
      items: Array.isArray(revision?.items)
        ? revision.items.map((item) => ({
          id: typeof item?.id === "string" && item.id ? item.id : crypto.randomUUID(),
          sourceItemId: typeof item?.sourceItemId === "string" ? item.sourceItemId : "",
          code: typeof item?.code === "string" ? item.code : "",
          title: typeof item?.title === "string" ? item.title : "",
          description: typeof item?.description === "string" ? item.description : "",
          quantity: typeof item?.quantity === "string" ? item.quantity : "1",
          unit: typeof item?.unit === "string" ? item.unit : "item",
          unitPrice: typeof item?.unitPrice === "string" ? item.unitPrice : "0.00"
        }))
        : [createEmptyQuoteItem()]
    }))
    : [];
}

function parseFinalMeasure(value: string | null | undefined) {
  return {
    ...createEmptyFinalMeasure(),
    ...parseJsonObject<Partial<FinalMeasureRecord>>(value, {})
  };
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function getCatalogRate(item: QuoteCatalogItemRecord, contractId: string) {
  return item.contractRates[contractId] ?? item.defaultRate ?? "0.00";
}

function getRateListName(contracts: ContractRecord[], contractId: string) {
  return contracts.find((contract) => contract.id === contractId)?.name || "Not set";
}

function QuoteItemSelector({
  contractId,
  emptyMessage,
  onAddItem,
  quoteItems,
  searchTerm,
  setSearchTerm
}: Readonly<{
  contractId: string;
  emptyMessage: string;
  onAddItem: (itemId: string) => void;
  quoteItems: QuoteCatalogItemRecord[];
  searchTerm: string;
  setSearchTerm: (value: string) => void;
}>) {
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const visibleItems = normalizedSearchTerm
    ? quoteItems.filter((item) => (
      item.code.toLowerCase().includes(normalizedSearchTerm) ||
      item.name.toLowerCase().includes(normalizedSearchTerm) ||
      item.description.toLowerCase().includes(normalizedSearchTerm)
    ))
    : quoteItems;

  return (
    <div className="field">
      <span>Add quoteable item</span>
      {!contractId ? <div className="muted">Select a rate list first.</div> : null}
      {contractId ? (
        <div className="panel" style={{ padding: 12, overflowX: "auto" }}>
          <div className="stack" style={{ gap: 12 }}>
            <label className="field">
              <span>Search rate items</span>
              <input className="input" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by code, item, or description" type="search" value={searchTerm} />
            </label>
            <div style={{ minWidth: 840 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 220px 1fr 100px 120px",
                  gap: 12,
                  padding: "0 0 10px",
                  borderBottom: "1px solid var(--line)",
                  fontWeight: 700
                }}
              >
                <div>Code</div>
                <div>Item</div>
                <div>Description</div>
                <div>Unit</div>
                <div>Rate</div>
              </div>
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  className="button button-subtle"
                  onClick={() => onAddItem(item.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px 220px 1fr 100px 120px",
                    gap: 12,
                    width: "100%",
                    borderRadius: 14,
                    padding: "12px 14px",
                    marginTop: 10,
                    justifyContent: "stretch",
                    textAlign: "left"
                  }}
                  type="button"
                >
                  <span>{item.code}</span>
                  <span>{item.name}</span>
                  <span className="muted">{item.description || "-"}</span>
                  <span>{item.unit}</span>
                  <span>{getCatalogRate(item, contractId)}</span>
                </button>
              ))}
              {visibleItems.length === 0 ? <div className="muted" style={{ paddingTop: 12 }}>{emptyMessage}</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function escapeCsvValue(value: string) {
  if (value.includes("\"") || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }

  return value;
}

function buildCsvContent(rows: string[][]) {
  return rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\r\n");
}

function parseCsvContent(content: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "");
}

function calculateQuoteTotal(items: QuoteLineItem[]) {
  return items.reduce((total, item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    return total + (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0);
  }, 0);
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
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [nextJobs, nextUsers, nextAssets] = await Promise.all([
        apiRequest<JobRecord[]>("jobs"),
        apiRequest<UserRecord[]>("users"),
        apiRequest<AssetRecord[]>("assets")
      ]);
      setJobs(nextJobs);
      setUsers(nextUsers);
      setAssets(nextAssets);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load jobs.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return { jobs, users, assets, error, setError, reload: load };
}

export function TenantOverviewPage() {
  const { jobs, users } = useJobsAndUsers();
  const [data, setData] = useState<{
    company?: CompanySummary;
    reporting?: ReportingSummary;
  }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiRequest<CompanySummary>("companies/me"),
      apiRequest<ReportingSummary>("reporting/summary")
    ])
      .then(([company, reporting]) => setData({ company, reporting }))
      .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "Failed to load dashboard."));
  }, []);

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const trainingWarningDate = new Date(now);
  trainingWarningDate.setDate(trainingWarningDate.getDate() + 30);

  const conflictAlerts = jobs
    .filter((job) => !["CANCELLED", "ON_HOLD", "COMPLETED"].includes(job.status))
    .flatMap((job) => (
    getScheduledDaysForJob(job).flatMap((day) => {
      const assignedUsers = getAssignedUsersForDay(job, day);

      return assignedUsers
        .filter((userId, index) => assignedUsers.indexOf(userId) === index)
        .filter((userId) => hasJobConflictForUser(job, jobs, day, userId))
        .map((userId) => {
          const user = users.find((entry) => entry.id === userId);
          return {
            key: `${job.id}:${day}:${userId}`,
            day,
            jobId: job.id,
            jobTitle: job.title,
            jobNumber: job.companyJobNumber || job.customerJobNumber,
            userId,
            userName: user?.fullName ?? "Unknown operative"
          };
        });
    })
  ))
    .filter((alert, index, alerts) => alerts.findIndex((entry) => entry.key === alert.key) === index)
    .sort((first, second) => {
      if (first.day !== second.day) {
        return first.day.localeCompare(second.day);
      }

      if (first.userName !== second.userName) {
        return first.userName.localeCompare(second.userName);
      }

      return first.jobTitle.localeCompare(second.jobTitle);
    });

  const trainingAlerts = users
    .flatMap((user) => parseTrainingRecords(user.trainingRecordsJson).map((record) => ({ user, record })))
    .map(({ user, record }) => {
      const expiry = new Date(`${record.expiresOn}T00:00:00`);
      expiry.setHours(0, 0, 0, 0);

      if (expiry < now) {
        return {
          key: `${user.id}:${record.id}:expired`,
          severity: "expired" as const,
          userId: user.id,
          userName: user.fullName,
          trainingName: record.name,
          expiresOn: record.expiresOn
        };
      }

      if (expiry <= trainingWarningDate) {
        return {
          key: `${user.id}:${record.id}:warning`,
          severity: "warning" as const,
          userId: user.id,
          userName: user.fullName,
          trainingName: record.name,
          expiresOn: record.expiresOn
        };
      }

      return null;
    })
    .filter((alert): alert is NonNullable<typeof alert> => alert !== null)
    .sort((first, second) => {
      if (first.severity !== second.severity) {
        return first.severity === "expired" ? -1 : 1;
      }

      if (first.expiresOn !== second.expiresOn) {
        return first.expiresOn.localeCompare(second.expiresOn);
      }

      return first.userName.localeCompare(second.userName);
    });

  return (
    <ProtectedWorkspace allow="tenant" description="Live company metrics, alerts, and operational status." title="Operations Overview">
      {(session) => (
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

          {canManageWorkspace(session.user.role) ? (
            <PanelGrid>
              <article className="panel" style={{ padding: 24 }}>
                <h2 style={{ marginTop: 0 }}>Schedule conflicts</h2>
                <ScrollList>
                  {conflictAlerts.length === 0 ? (
                    <div className="muted">No operative clashes found in the current schedule.</div>
                  ) : (
                    conflictAlerts.map((alert) => (
                      <Link
                        key={alert.key}
                        href={jobDetailHref(alert.jobId, "schedule")}
                        style={{
                          display: "block",
                          padding: 14,
                          borderRadius: 16,
                          border: "1px solid rgba(251, 113, 133, 0.4)",
                          background: "rgba(251, 113, 133, 0.12)",
                          color: "inherit",
                          textDecoration: "none"
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{alert.jobTitle}</div>
                        <div className="muted">{alert.jobNumber || "No job number"} • {alert.day}</div>
                        <div style={{ marginTop: 6 }}>Conflict for {alert.userName}</div>
                      </Link>
                    ))
                  )}
                </ScrollList>
              </article>

              <article className="panel" style={{ padding: 24 }}>
                <h2 style={{ marginTop: 0 }}>Training alerts</h2>
                <ScrollList>
                  {trainingAlerts.length === 0 ? (
                    <div className="muted">No expired or upcoming training renewals.</div>
                  ) : (
                    trainingAlerts.map((alert) => (
                      <Link
                        key={alert.key}
                        href={userDetailHref(alert.userId, "training")}
                        style={{
                          display: "block",
                          padding: 14,
                          borderRadius: 16,
                          border: alert.severity === "expired"
                            ? "1px solid rgba(251, 113, 133, 0.4)"
                            : "1px solid rgba(251, 191, 36, 0.4)",
                          background: alert.severity === "expired"
                            ? "rgba(251, 113, 133, 0.12)"
                            : "rgba(251, 191, 36, 0.12)",
                          color: "inherit",
                          textDecoration: "none"
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{alert.trainingName}</div>
                        <div className="muted">{alert.userName}</div>
                        <div style={{ marginTop: 6 }}>
                          {alert.severity === "expired" ? "Expired" : "Due soon"} on {alert.expiresOn}
                        </div>
                      </Link>
                    ))
                  )}
                </ScrollList>
              </article>
            </PanelGrid>
          ) : null}
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
  const { jobs, users, error } = useJobsAndUsers();
  const [searchTerm, setSearchTerm] = useState("");
  const usersById = new Map(users.map((user) => [user.id, user]));
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const visibleJobs = normalizedSearchTerm
    ? jobs.filter((job) => (
      job.title.toLowerCase().includes(normalizedSearchTerm) ||
      job.companyJobNumber.toLowerCase().includes(normalizedSearchTerm) ||
      job.customerJobNumber.toLowerCase().includes(normalizedSearchTerm)
    ))
    : [...jobs].slice(0, 10);

  return (
    <ProtectedWorkspace allow="tenant" description="View the most recent jobs and open them for review." title="Jobs">
      {(session) => {
        const canManage = canManageWorkspace(session.user.role);
        return (
          <div className="stack">
            <ErrorText error={error} />
            <article className="panel" style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0 }}>{canManage ? "Latest jobs" : "My latest jobs"}</h2>
                  <div className="muted" style={{ marginTop: 8 }}>
                    {normalizedSearchTerm
                      ? `Showing ${visibleJobs.length} matching job${visibleJobs.length === 1 ? "" : "s"}.`
                      : canManage
                        ? "The 10 most recently created jobs across the workspace."
                        : "The 10 most recent jobs assigned to you."}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
                  <label className="field" style={{ minWidth: 280 }}>
                    <span>Search jobs</span>
                    <input
                      className="input"
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Job number or title"
                      type="search"
                      value={searchTerm}
                    />
                  </label>
                  {canManage ? <Link className="button" href="/dashboard/jobs/new">Create Job</Link> : null}
                </div>
              </div>
            </article>
            <article className="panel" style={{ padding: 24 }}>
              <div className="stack">
                {visibleJobs.length === 0 ? <div className="muted">No jobs found.</div> : null}
                {visibleJobs.map((job) => (
                  <Link key={job.id} className="panel" href={jobDetailHref(job.id, canManage ? "details" : "schedule")} style={{ padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{job.companyJobNumber}</div>
                        <div className="muted" style={{ marginTop: 4 }}>{job.title}</div>
                      </div>
                      <div className="badge">{job.status.replaceAll("_", " ")}</div>
                    </div>
                    <div className="muted" style={{ marginTop: 10 }}>{job.siteAddress}</div>
                    <div className="muted">
                      Working hours: {job.scheduledStartTime && job.scheduledEndTime ? `${job.scheduledStartTime} - ${job.scheduledEndTime}` : "Not set"}
                    </div>
                    <div className="muted">
                      Scheduled: {getScheduledDaysForJob(job).length > 0
                        ? getScheduledDaysForJob(job).map((day) => new Date(`${day}T00:00:00`).toLocaleDateString()).join(", ")
                        : "Not scheduled"}
                    </div>
                    <div className="muted">
                      Assigned: {[...new Set(getScheduledDaysForJob(job).flatMap((day) => getAssignedUsersForDay(job, day)))].length > 0
                        ? [...new Set(getScheduledDaysForJob(job).flatMap((day) => getAssignedUsersForDay(job, day)))].map((id) => usersById.get(id)?.fullName ?? id).join(", ")
                        : "Unassigned"}
                    </div>
                    {canManage ? (
                      <div className="muted">
                        Quote: {job.quoteStatus?.replaceAll("_", " ") || "Not started"}
                      </div>
                    ) : null}
                  </Link>
                ))}
              </div>
            </article>
          </div>
        );
      }}
    </ProtectedWorkspace>
  );
}

export function CreateJobPage() {
  const router = useRouter();
  const { jobs, users, assets, error, reload } = useJobsAndUsers();
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [quoteItems, setQuoteItems] = useState<QuoteCatalogItemRecord[]>([]);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedOperativeId, setSelectedOperativeId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [quoteItemSearchTerm, setQuoteItemSearchTerm] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quotation, setQuotation] = useState<QuotationRecord>(() => createEmptyQuotation());
  const [finalMeasure, setFinalMeasure] = useState<FinalMeasureRecord>(() => createEmptyFinalMeasure());
  const [form, setForm] = useState<{
    title: string;
    companyJobNumber: string;
    customerJobNumber: string;
    siteAddress: string;
    externalInfo: string;
    internalInfo: string;
    status: string;
    scheduledStartTime: string;
    scheduledEndTime: string;
    scheduledDays: string[];
    dailyAssignments: Record<string, string[]>;
    assignedVehicleIds: string[];
  }>({
    title: "",
    companyJobNumber: "",
    customerJobNumber: "",
    siteAddress: "",
    externalInfo: "",
    internalInfo: "",
    status: JOB_STATUS_VALUES[1],
    scheduledStartTime: "08:00",
    scheduledEndTime: "17:00",
    scheduledDays: [],
    dailyAssignments: {},
    assignedVehicleIds: []
  });
  const usersById = new Map(users.map((user) => [user.id, user]));
  const operativeOptions = users.filter((user) => user.role === "OPERATIVE");
  const vehicleOptions = assets.filter((asset) => (asset.kind ?? "GENERAL") === "VEHICLE");

  useEffect(() => {
    apiRequest<{ contracts: ContractRecord[]; items: QuoteCatalogItemRecord[] }>("jobs/quotation/options")
      .then((result) => {
        setContracts(result.contracts);
        setQuoteItems(result.items);
        setQuotation((current) => ({
          ...current,
          contractId: current.contractId || result.contracts[0]?.id || ""
        }));
      })
      .catch(() => undefined);
  }, []);

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

  function addVehicle() {
    if (!selectedVehicleId) {
      return;
    }

    setForm((current) => ({
      ...current,
      assignedVehicleIds: current.assignedVehicleIds.includes(selectedVehicleId)
        ? current.assignedVehicleIds
        : [...current.assignedVehicleIds, selectedVehicleId]
    }));
    setSelectedVehicleId("");
  }

  function removeVehicle(vehicleId: string) {
    setForm((current) => ({
      ...current,
      assignedVehicleIds: current.assignedVehicleIds.filter((id) => id !== vehicleId)
    }));
  }

  function addQuoteItemFromCatalog(itemId: string) {
    if (!itemId) {
      return;
    }

    const matchedItem = quoteItems.find((item) => item.id === itemId);
    if (!matchedItem) {
      return;
    }

    setQuotation((current) => {
      const nextItems = [
        ...current.items,
        {
          id: crypto.randomUUID(),
          sourceItemId: matchedItem.id,
          code: matchedItem.code,
          title: matchedItem.name,
          description: matchedItem.description,
          quantity: "1",
          unit: matchedItem.unit,
          unitPrice: getCatalogRate(matchedItem, current.contractId)
        }
      ];

      return {
        ...current,
        items: nextItems,
        totalAmount: calculateQuoteTotal(nextItems).toFixed(2)
      };
    });
  }

  function updateQuotationItemInCreate(itemId: string, key: keyof QuoteLineItem, value: string) {
    setQuotation((current) => {
      const nextItems = current.items.map((item) => item.id === itemId ? { ...item, [key]: value } : item);
      return {
        ...current,
        items: nextItems,
        totalAmount: calculateQuoteTotal(nextItems).toFixed(2)
      };
    });
  }

  function removeQuotationItemInCreate(itemId: string) {
    setQuotation((current) => {
      const nextItems = current.items.filter((item) => item.id !== itemId);
      return {
        ...current,
        items: nextItems.length > 0 ? nextItems : [createEmptyQuoteItem()],
        totalAmount: (nextItems.length > 0 ? calculateQuoteTotal(nextItems) : 0).toFixed(2)
      };
    });
  }

  const assignmentWarnings = form.scheduledDays.flatMap((day) =>
    (form.dailyAssignments[day] ?? []).flatMap((userId) => {
      const conflicts = jobs.filter((job) =>
        getAssignedUsersForDay(job, day).includes(userId) &&
        jobsOverlapByTime(
          {
            id: "new-job",
            title: form.title,
            companyJobNumber: form.companyJobNumber,
            customerJobNumber: form.customerJobNumber,
            siteAddress: form.siteAddress,
            externalInfo: form.externalInfo,
            internalInfo: form.internalInfo,
            status: form.status,
            scheduledFor: null,
            scheduledTo: null,
            scheduledStartTime: form.scheduledStartTime || null,
            scheduledEndTime: form.scheduledEndTime || null,
            scheduledDays: form.scheduledDays,
            dailyAssignmentsJson: JSON.stringify(form.dailyAssignments),
            assignedOperativeIds: [],
            assignedVehicleIds: form.assignedVehicleIds
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

  const vehicleWarnings = form.scheduledDays.flatMap((day) =>
    form.assignedVehicleIds.flatMap((vehicleId) => {
      const conflicts = jobs.filter((job) =>
        (job.assignedVehicleIds ?? []).includes(vehicleId) &&
        (job.scheduledDays ?? []).includes(day) &&
        jobsOverlapByTime(
          {
            id: "new-job",
            title: form.title,
            companyJobNumber: form.companyJobNumber,
            customerJobNumber: form.customerJobNumber,
            siteAddress: form.siteAddress,
            externalInfo: form.externalInfo,
            internalInfo: form.internalInfo,
            status: form.status,
            scheduledFor: null,
            scheduledTo: null,
            scheduledStartTime: form.scheduledStartTime || null,
            scheduledEndTime: form.scheduledEndTime || null,
            scheduledDays: form.scheduledDays,
            dailyAssignmentsJson: JSON.stringify(form.dailyAssignments),
            assignedOperativeIds: [],
            assignedVehicleIds: form.assignedVehicleIds
          },
          job
        )
      );

      return conflicts.map((job) => ({
        day,
        vehicleId,
        vehicleName: vehicleOptions.find((asset) => asset.id === vehicleId)?.name ?? vehicleId,
        jobTitle: job.title,
        companyJobNumber: job.companyJobNumber
      }));
    })
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    try {
      await apiRequest("jobs", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          quoteStatus: quotation.totalAmount ? "DRAFT" : "NOT_STARTED",
          quotation,
          quotationRevisions: [],
          finalMeasure,
          scheduledFor: rangeStart ? `${rangeStart}T00:00:00` : undefined,
          scheduledTo: rangeEnd ? `${rangeEnd}T23:59:59` : undefined,
          scheduledStartTime: form.scheduledStartTime || undefined,
          scheduledEndTime: form.scheduledEndTime || undefined,
          dailyAssignments: Object.fromEntries(
            form.scheduledDays.map((day) => [day, form.dailyAssignments[day] ?? []])
          ),
          assignedVehicleIds: form.assignedVehicleIds
        })
      });
      await reload();
      router.replace("/dashboard/jobs");
      router.refresh();
    } catch (caughtError) {
      setSubmitError(caughtError instanceof Error ? caughtError.message : "Failed to create job.");
    }
  }

  return (
    <ProtectedWorkspace allow="tenant" description="Create a new job and assign it to the right team." title="Create Job">
      {(session) => {
        const canManage = canManageWorkspace(session.user.role);
        if (!canManage) {
          return <div className="panel" style={{ padding: 24 }}>Only managers can create jobs.</div>;
        }

        return (
          <article className="panel" style={{ padding: 24 }}>
            <form className="stack" onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 24, alignItems: "start" }}>
                <div className="stack">
                  <div className="panel" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 16 }}>Job details</div>
                    <div className="stack">
                      <TextField label="Title" onChange={(value) => setForm((current) => ({ ...current, title: value }))} value={form.title} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <TextField label="Company job number" onChange={(value) => setForm((current) => ({ ...current, companyJobNumber: value }))} value={form.companyJobNumber} />
                        <TextField label="Customer job number" onChange={(value) => setForm((current) => ({ ...current, customerJobNumber: value }))} value={form.customerJobNumber} />
                      </div>
                      <TextField label="Site address" onChange={(value) => setForm((current) => ({ ...current, siteAddress: value }))} value={form.siteAddress} />
                      <SelectField label="Status" onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[...JOB_STATUS_VALUES]} value={form.status} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <TextField label="Working start time" onChange={(value) => setForm((current) => ({ ...current, scheduledStartTime: value }))} type="time" value={form.scheduledStartTime} />
                        <TextField label="Working finish time" onChange={(value) => setForm((current) => ({ ...current, scheduledEndTime: value }))} type="time" value={form.scheduledEndTime} />
                      </div>
                    </div>
                  </div>

                  <div className="panel" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 16 }}>External info</div>
                    <div className="muted" style={{ marginBottom: 12 }}>This is visible to operatives on the job.</div>
                    <TextAreaField
                      label="External Info"
                      onChange={(value) => setForm((current) => ({ ...current, externalInfo: value }))}
                      value={form.externalInfo}
                    />
                  </div>

                  <div className="panel" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 16 }}>Internal info</div>
                    <div className="muted" style={{ marginBottom: 12 }}>Manager-only notes for planning, handover, and commercial detail.</div>
                    <TextAreaField
                      label="Internal Info"
                      onChange={(value) => setForm((current) => ({ ...current, internalInfo: value }))}
                      value={form.internalInfo}
                    />
                  </div>

                  <div className="panel" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 16 }}>Quotation</div>
                    <div className="stack">
                      <label className="field">
                        <span>Rate list dropdown</span>
                        <select
                          className="input"
                          onChange={(event) => {
                            const value = event.target.value;
                            setQuotation((current) => {
                              const nextItems = current.items.map((item) => {
                                const matchedItem = item.sourceItemId ? quoteItems.find((entry) => entry.id === item.sourceItemId) : undefined;
                                return matchedItem ? { ...item, unitPrice: getCatalogRate(matchedItem, value) } : item;
                              });

                              return {
                                ...current,
                                contractId: value,
                                items: nextItems,
                                totalAmount: calculateQuoteTotal(nextItems).toFixed(2)
                              };
                            });
                          }}
                          value={quotation.contractId}
                        >
                          <option value="">Choose a rate list</option>
                          {contracts.map((contract) => (
                            <option key={contract.id} value={contract.id}>{contract.name}</option>
                          ))}
                        </select>
                        <span className="muted" style={{ fontSize: 12 }}>Select the customer rate list to price the quotation items.</span>
                      </label>
                      <TextField label="Quotation reference" onChange={(value) => setQuotation((current) => ({ ...current, reference: value }))} value={quotation.reference} />
                      <TextAreaField label="Scope of works" onChange={(value) => setQuotation((current) => ({ ...current, scope: value }))} value={quotation.scope} />
                      <TextAreaField label="Assumptions" onChange={(value) => setQuotation((current) => ({ ...current, assumptions: value }))} value={quotation.assumptions} />
                      <TextAreaField label="Exclusions" onChange={(value) => setQuotation((current) => ({ ...current, exclusions: value }))} value={quotation.exclusions} />
                      <QuoteItemSelector
                        contractId={quotation.contractId}
                        emptyMessage="No rate items match this search."
                        onAddItem={addQuoteItemFromCatalog}
                        quoteItems={quoteItems}
                        searchTerm={quoteItemSearchTerm}
                        setSearchTerm={setQuoteItemSearchTerm}
                      />
                      <div className="stack">
                        {quotation.items.map((item) => (
                          <div key={item.id} className="panel" style={{ padding: 14 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr", gap: 12 }}>
                              <TextField label="Item" onChange={(value) => updateQuotationItemInCreate(item.id, "title", value)} value={item.title} />
                              <TextField label="Qty" onChange={(value) => updateQuotationItemInCreate(item.id, "quantity", value)} value={item.quantity} />
                              <TextField label="Unit" onChange={(value) => updateQuotationItemInCreate(item.id, "unit", value)} value={item.unit} />
                              <TextField label="Rate" onChange={(value) => updateQuotationItemInCreate(item.id, "unitPrice", value)} value={item.unitPrice} />
                            </div>
                            <TextAreaField label="Description" onChange={(value) => updateQuotationItemInCreate(item.id, "description", value)} value={item.description} />
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                              <div className="muted">{item.code || "Custom item"}</div>
                              <button className="button button-subtle" onClick={() => removeQuotationItemInCreate(item.id)} type="button">Remove item</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <TextField label="Quoted total" onChange={(value) => setQuotation((current) => ({ ...current, totalAmount: value }))} value={quotation.totalAmount} />
                    </div>
                  </div>

                  <div className="panel" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 16 }}>Final measure</div>
                    <div className="stack">
                      <TextField label="Measured by" onChange={(value) => setFinalMeasure((current) => ({ ...current, measuredBy: value }))} value={finalMeasure.measuredBy} />
                      <TextField label="Measured on" onChange={(value) => setFinalMeasure((current) => ({ ...current, measuredOn: value }))} type="date" value={finalMeasure.measuredOn} />
                      <TextAreaField label="Measure summary" onChange={(value) => setFinalMeasure((current) => ({ ...current, summary: value }))} value={finalMeasure.summary} />
                      <TextField label="Measured total value" onChange={(value) => setFinalMeasure((current) => ({ ...current, totalMeasuredValue: value }))} value={finalMeasure.totalMeasuredValue} />
                    </div>
                  </div>
                </div>

                <div className="stack">
                  <div className="panel" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 16 }}>Job summary</div>
                    <div className="stack" style={{ gap: 12 }}>
                      <div>
                        <div className="muted">Title</div>
                        <div style={{ fontWeight: 700 }}>{form.title || "New job"}</div>
                      </div>
                      <div>
                        <div className="muted">Company job number</div>
                        <div style={{ fontWeight: 700 }}>{form.companyJobNumber || "Not set"}</div>
                      </div>
                      <div>
                        <div className="muted">Customer job number</div>
                        <div style={{ fontWeight: 700 }}>{form.customerJobNumber || "Not set"}</div>
                      </div>
                      <div>
                        <div className="muted">Status</div>
                        <div style={{ fontWeight: 700 }}>{form.status}</div>
                      </div>
                      <div>
                        <div className="muted">Quote status</div>
                        <div style={{ fontWeight: 700 }}>{quotation.totalAmount ? "DRAFT" : "NOT STARTED"}</div>
                      </div>
                      <div>
                        <div className="muted">Working hours</div>
                        <div style={{ fontWeight: 700 }}>{form.scheduledStartTime} - {form.scheduledEndTime}</div>
                      </div>
                      <div>
                        <div className="muted">Quoted total</div>
                        <div style={{ fontWeight: 700 }}>{quotation.totalAmount || "Not set"}</div>
                      </div>
                    </div>
                  </div>
                </div>
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
                    <span>Select operative</span>
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
              <div className="field">
                <span>Assign vehicles</span>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                  <label className="field" style={{ flex: "1 1 260px" }}>
                    <span>Select vehicle</span>
                    <select className="input" onChange={(event) => setSelectedVehicleId(event.target.value)} value={selectedVehicleId}>
                      <option value="">Choose a vehicle</option>
                      {vehicleOptions.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.name} {vehicle.registrationNumber ? `(${vehicle.registrationNumber})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button button-subtle" onClick={addVehicle} type="button">Add Vehicle</button>
                </div>
                {vehicleWarnings.length > 0 ? (
                  <div className="error-banner">
                    {vehicleWarnings.map((warning) => (
                      <div key={`${warning.day}-${warning.vehicleId}-${warning.companyJobNumber}`}>
                        {warning.vehicleName} already has {warning.companyJobNumber} ({warning.jobTitle}) on {new Date(`${warning.day}T00:00:00`).toLocaleDateString()}.
                      </div>
                    ))}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {form.assignedVehicleIds.length === 0 ? <div className="muted">No vehicles assigned.</div> : null}
                  {form.assignedVehicleIds.map((vehicleId) => {
                    const vehicle = vehicleOptions.find((entry) => entry.id === vehicleId);
                    return (
                      <div key={vehicleId} className="assignment-pill">
                        <span>{vehicle?.name ?? vehicleId}{vehicle?.registrationNumber ? ` (${vehicle.registrationNumber})` : ""}</span>
                        <button className="assignment-pill-remove" onClick={() => removeVehicle(vehicleId)} type="button">Remove</button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button className="button" type="submit">Create Job</button>
                <Link className="button button-subtle" href="/dashboard/jobs">Cancel</Link>
              </div>
            </form>
            <ErrorText error={submitError ?? error} />
          </article>
        );
      }}
    </ProtectedWorkspace>
  );
}

export function JobRecordPage({
  initialTab = "details",
  jobId
}: Readonly<{
  initialTab?: "details" | "external" | "internal" | "schedule" | "quotation";
  jobId: string;
}>) {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [allJobs, setAllJobs] = useState<JobRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [documents, setDocuments] = useState<JobDocumentRecord[]>([]);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [quoteItems, setQuoteItems] = useState<QuoteCatalogItemRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadingDocumentArea, setUploadingDocumentArea] = useState<"EXTERNAL" | "INTERNAL" | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "external" | "internal" | "schedule" | "quotation">(initialTab);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedOperativeId, setSelectedOperativeId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [quotation, setQuotation] = useState<QuotationRecord>(() => createEmptyQuotation());
  const [quotationRevisions, setQuotationRevisions] = useState<QuotationRevision[]>([]);
  const [quoteStage, setQuoteStage] = useState<"initial" | "revision" | "final">("initial");
  const [selectedRevisionId, setSelectedRevisionId] = useState("");
  const [finalMeasure, setFinalMeasure] = useState<FinalMeasureRecord>(() => createEmptyFinalMeasure());
  const [quoteItemSearchTerm, setQuoteItemSearchTerm] = useState("");
  const [revisionQuoteItemSearchTerm, setRevisionQuoteItemSearchTerm] = useState("");
  const [form, setForm] = useState<{
    title: string;
    companyJobNumber: string;
    customerJobNumber: string;
    siteAddress: string;
    externalInfo: string;
    internalInfo: string;
    status: string;
    scheduledStartTime: string;
    scheduledEndTime: string;
    scheduledDays: string[];
    dailyAssignments: Record<string, string[]>;
    assignedVehicleIds: string[];
  }>({
    title: "",
    companyJobNumber: "",
    customerJobNumber: "",
    siteAddress: "",
    externalInfo: "",
    internalInfo: "",
    status: JOB_STATUS_VALUES[1],
    scheduledStartTime: "08:00",
    scheduledEndTime: "17:00",
    scheduledDays: [] as string[],
    dailyAssignments: {} as Record<string, string[]>,
    assignedVehicleIds: [] as string[]
  });

  const usersById = new Map(users.map((user) => [user.id, user]));
  const operativeOptions = users.filter((user) => user.role === "OPERATIVE");
  const vehicleOptions = assets.filter((asset) => (asset.kind ?? "GENERAL") === "VEHICLE");

  async function load() {
    try {
      const [nextJob, nextUsers, nextJobs, nextDocuments, nextAssets] = await Promise.all([
        apiRequest<JobRecord>(`jobs/${jobId}`),
        apiRequest<UserRecord[]>("users"),
        apiRequest<JobRecord[]>("jobs"),
        apiRequest<JobDocumentRecord[]>(`jobs/${jobId}/documents`),
        apiRequest<AssetRecord[]>("assets")
      ]);
      setJob(nextJob);
      setUsers(nextUsers);
      setAllJobs(nextJobs);
      setDocuments(nextDocuments);
      setAssets(nextAssets);
      setQuotation(parseQuotation(nextJob.quotationJson));
      const nextRevisions = parseQuotationRevisions(nextJob.quotationRevisionsJson);
      setQuotationRevisions(nextRevisions);
      setSelectedRevisionId(nextRevisions.length > 0 ? nextRevisions[nextRevisions.length - 1].id : "");
      setFinalMeasure(parseFinalMeasure(nextJob.finalMeasureJson));
      const scheduledDays = (nextJob.scheduledDays ?? []).length > 0
        ? [...nextJob.scheduledDays].sort()
        : [nextJob.scheduledFor ? new Date(nextJob.scheduledFor).toISOString().slice(0, 10) : ""].filter(Boolean);
      setForm({
        title: nextJob.title,
        companyJobNumber: nextJob.companyJobNumber,
        customerJobNumber: nextJob.customerJobNumber,
        siteAddress: nextJob.siteAddress,
        externalInfo: nextJob.externalInfo ?? "",
        internalInfo: nextJob.internalInfo ?? "",
        status: nextJob.status,
        scheduledStartTime: nextJob.scheduledStartTime ?? "08:00",
        scheduledEndTime: nextJob.scheduledEndTime ?? "17:00",
        scheduledDays,
        dailyAssignments: Object.fromEntries(
          scheduledDays.map((day) => [day, getAssignedUsersForDay(nextJob, day)])
        ),
        assignedVehicleIds: nextJob.assignedVehicleIds ?? []
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

  useEffect(() => {
    apiRequest<{ contracts: ContractRecord[]; items: QuoteCatalogItemRecord[] }>("jobs/quotation/options")
      .then((result) => {
        setContracts(result.contracts);
        setQuoteItems(result.items);
      })
      .catch(() => undefined);
  }, []);

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

  function addVehicle() {
    if (!selectedVehicleId) {
      return;
    }

    setForm((current) => ({
      ...current,
      assignedVehicleIds: current.assignedVehicleIds.includes(selectedVehicleId)
        ? current.assignedVehicleIds
        : [...current.assignedVehicleIds, selectedVehicleId]
    }));
    setSelectedVehicleId("");
  }

  function removeVehicle(vehicleId: string) {
    setForm((current) => ({
      ...current,
      assignedVehicleIds: current.assignedVehicleIds.filter((id) => id !== vehicleId)
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
        externalInfo: form.externalInfo,
        internalInfo: form.internalInfo,
        status: form.status,
        scheduledStartTime: form.scheduledStartTime || null,
        scheduledEndTime: form.scheduledEndTime || null,
        scheduledDays: form.scheduledDays,
        dailyAssignmentsJson: JSON.stringify(form.dailyAssignments),
        assignedOperativeIds: [...new Set(Object.values(form.dailyAssignments).flat())],
        assignedVehicleIds: form.assignedVehicleIds
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
  const vehicleOverlapWarnings = form.scheduledDays.flatMap((day) =>
    form.assignedVehicleIds.flatMap((vehicleId) => {
      if (!job) {
        return [];
      }

      const conflicts = allJobs.filter((candidate) =>
        candidate.id !== job.id &&
        (candidate.assignedVehicleIds ?? []).includes(vehicleId) &&
        (candidate.scheduledDays ?? []).includes(day) &&
        jobsOverlapByTime(
          {
            ...job,
            title: form.title,
            companyJobNumber: form.companyJobNumber,
            customerJobNumber: form.customerJobNumber,
            siteAddress: form.siteAddress,
            externalInfo: form.externalInfo,
            internalInfo: form.internalInfo,
            status: form.status,
            scheduledStartTime: form.scheduledStartTime || null,
            scheduledEndTime: form.scheduledEndTime || null,
            scheduledDays: form.scheduledDays,
            dailyAssignmentsJson: JSON.stringify(form.dailyAssignments),
            assignedOperativeIds: [...new Set(Object.values(form.dailyAssignments).flat())],
            assignedVehicleIds: form.assignedVehicleIds
          },
          candidate
        )
      );

      return conflicts.map((candidate) => ({
        day,
        vehicleId,
        vehicleName: vehicleOptions.find((asset) => asset.id === vehicleId)?.name ?? vehicleId,
        jobTitle: candidate.title,
        companyJobNumber: candidate.companyJobNumber
      }));
    })
  );
  void overlapWarnings;
  void vehicleOverlapWarnings;

  async function handleSave() {
    setError(null);
    setSuccess(null);
    try {
      await apiRequest(`jobs/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          quoteStatus: quotation.totalAmount ? "DRAFT" : "NOT_STARTED",
          quotation,
          quotationRevisions,
          finalMeasure,
          scheduledFor: rangeStart ? `${rangeStart}T00:00:00` : undefined,
          scheduledTo: rangeEnd ? `${rangeEnd}T23:59:59` : undefined,
          scheduledStartTime: form.scheduledStartTime || undefined,
          scheduledEndTime: form.scheduledEndTime || undefined,
          dailyAssignments: Object.fromEntries(
            form.scheduledDays.map((day) => [day, form.dailyAssignments[day] ?? []])
          ),
          assignedVehicleIds: form.assignedVehicleIds
        })
      });
      setSuccess("Job updated successfully.");
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to save job.");
    }
  }

  async function handleUploadDocument(visibility: "EXTERNAL" | "INTERNAL", file: File | null) {
    if (!file) {
      return;
    }

    setUploadingDocumentArea(visibility);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      await apiRequest<JobDocumentRecord>(`jobs/${jobId}/documents/${visibility}`, {
        method: "POST",
        body: formData
      });
      setSuccess(visibility === "EXTERNAL" ? "External file uploaded." : "Internal file uploaded.");
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to upload file.");
    } finally {
      setUploadingDocumentArea(null);
    }
  }

  async function handleOpenJobDocument(documentId: string, fileName: string) {
    setOpeningDocumentId(documentId);
    setError(null);

    try {
      await openProtectedFile(`jobs/${jobId}/documents/${documentId}/download`, fileName);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to open file.");
    } finally {
      setOpeningDocumentId(null);
    }
  }

  function addQuotationItem() {
    setQuotation((current) => ({
      ...current,
      items: [...current.items, createEmptyQuoteItem()]
    }));
  }

  function updateQuotationItem(itemId: string, key: keyof QuoteLineItem, value: string) {
    setQuotation((current) => {
      const nextItems = current.items.map((item) => item.id === itemId ? { ...item, [key]: value } : item);
      return {
        ...current,
        items: nextItems,
        totalAmount: calculateQuoteTotal(nextItems).toFixed(2)
      };
    });
  }

  function removeQuotationItem(itemId: string) {
    setQuotation((current) => {
      const nextItems = current.items.length === 1 ? current.items : current.items.filter((item) => item.id !== itemId);
      return {
        ...current,
        items: nextItems,
        totalAmount: calculateQuoteTotal(nextItems).toFixed(2)
      };
    });
  }

  function getNextRevisionLabel() {
    return `Revision ${String.fromCharCode(65 + quotationRevisions.length)}`;
  }

  function createRevisionFromBase() {
    const source = quotationRevisions.find((revision) => revision.id === selectedRevisionId);
    const base = source
      ? {
        contractId: source.contractId,
        reference: source.reference,
        scope: source.scope,
        exclusions: source.exclusions,
        assumptions: source.assumptions,
        revisionNotes: source.note,
        totalAmount: source.totalAmount,
        items: source.items.map((item) => ({ ...item, id: crypto.randomUUID() }))
      }
      : {
        ...quotation,
        items: quotation.items.map((item) => ({ ...item, id: crypto.randomUUID() }))
      };
    const snapshot: QuotationRevision = {
      id: crypto.randomUUID(),
      label: getNextRevisionLabel(),
      createdAt: new Date().toISOString(),
      contractId: base.contractId,
      reference: base.reference,
      scope: base.scope,
      exclusions: base.exclusions,
      assumptions: base.assumptions,
      note: base.revisionNotes,
      totalAmount: base.totalAmount,
      items: base.items
    };
    setQuotationRevisions((current) => [...current, snapshot]);
    setSelectedRevisionId(snapshot.id);
    setSuccess(`Created ${snapshot.label}. Remember to save the job to keep it.`);
  }

  function updateRevisionField(revisionId: string, updater: (revision: QuotationRevision) => QuotationRevision) {
    setQuotationRevisions((current) => current.map((revision) => revision.id === revisionId ? updater(revision) : revision));
  }

  function updateRevisionItem(revisionId: string, itemId: string, key: keyof QuoteLineItem, value: string) {
    updateRevisionField(revisionId, (revision) => {
      const nextItems = revision.items.map((item) => item.id === itemId ? { ...item, [key]: value } : item);
      return {
        ...revision,
        items: nextItems,
        totalAmount: calculateQuoteTotal(nextItems).toFixed(2)
      };
    });
  }

  function addRevisionItem(revisionId: string) {
    updateRevisionField(revisionId, (revision) => {
      const nextItems = [...revision.items, createEmptyQuoteItem()];
      return {
        ...revision,
        items: nextItems,
        totalAmount: calculateQuoteTotal(nextItems).toFixed(2)
      };
    });
  }

  function removeRevisionItem(revisionId: string, itemId: string) {
    updateRevisionField(revisionId, (revision) => {
      const nextItems = revision.items.length === 1 ? revision.items : revision.items.filter((item) => item.id !== itemId);
      return {
        ...revision,
        items: nextItems,
        totalAmount: calculateQuoteTotal(nextItems).toFixed(2)
      };
    });
  }

  function addQuoteItemToRevisionFromLibrary(revisionId: string, itemId: string) {
    if (!itemId) {
      return;
    }

    const matchedItem = quoteItems.find((item) => item.id === itemId);
    if (!matchedItem) {
      return;
    }

    updateRevisionField(revisionId, (revision) => {
      const nextItems = [
        ...revision.items,
        {
          id: crypto.randomUUID(),
          sourceItemId: matchedItem.id,
          code: matchedItem.code,
          title: matchedItem.name,
          description: matchedItem.description,
          quantity: "1",
          unit: matchedItem.unit,
          unitPrice: getCatalogRate(matchedItem, revision.contractId)
        }
      ];

      return {
        ...revision,
        items: nextItems,
        totalAmount: calculateQuoteTotal(nextItems).toFixed(2)
      };
    });
  }

  function addQuoteItemFromLibrary(itemId: string) {
    if (!itemId) {
      return;
    }

    const matchedItem = quoteItems.find((item) => item.id === itemId);
    if (!matchedItem) {
      return;
    }

    setQuotation((current) => {
      const nextItems = [
        ...current.items,
        {
          id: crypto.randomUUID(),
          sourceItemId: matchedItem.id,
          code: matchedItem.code,
          title: matchedItem.name,
          description: matchedItem.description,
          quantity: "1",
          unit: matchedItem.unit,
          unitPrice: getCatalogRate(matchedItem, current.contractId)
        }
      ];

      return {
        ...current,
        items: nextItems,
        totalAmount: calculateQuoteTotal(nextItems).toFixed(2)
      };
    });
  }

  const activeRevision = quotationRevisions.find((revision) => revision.id === selectedRevisionId) ?? null;
  const latestRevision = quotationRevisions.length > 0 ? quotationRevisions[quotationRevisions.length - 1] : null;

  return (
    <ProtectedWorkspace allow="tenant" description="Review a single job record and manage its scheduling." title={job ? job.title : "Job Record"}>
      {(session) => {
        const canManage = canManageWorkspace(session.user.role);
        const visibleActiveTab = !canManage && (activeTab === "internal" || activeTab === "quotation") ? "external" : activeTab;
        const externalDocuments = documents.filter((document) => (document.visibility ?? "EXTERNAL") === "EXTERNAL");
        const internalDocuments = documents.filter((document) => document.visibility === "INTERNAL");
        const tabs: Array<{ key: "details" | "external" | "internal" | "schedule" | "quotation"; label: string }> = [
          { key: "details" as const, label: "Details" },
          ...(canManage ? [{ key: "quotation" as const, label: "Quotation" }] : []),
          { key: "external" as const, label: canManage ? "External Info" : "Information" },
          ...(canManage ? [{ key: "internal" as const, label: "Internal Info" }] : []),
          { key: "schedule" as const, label: "Schedule" }
        ];
        return (
        <div className="stack">
          <ErrorText error={error} />
          {success ? <div className="panel" style={{ padding: 18, borderRadius: 18 }}>{success}</div> : null}
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={visibleActiveTab === tab.key ? "button" : "button button-subtle"}
                  onClick={() => setActiveTab(tab.key)}
                  style={{ borderRadius: 0, minWidth: 140 }}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div style={{ padding: 24 }}>
              {visibleActiveTab === "details" ? (
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
                      <div>
                        <div className="muted">Quote status</div>
                        <div style={{ fontWeight: 700 }}>{job?.quoteStatus?.replaceAll("_", " ") || "Not started"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {visibleActiveTab === "quotation" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 24 }}>
                  <div className="stack">
                    <div className="panel" style={{ padding: 16 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {[
                          { key: "initial" as const, label: "Initial Quote" },
                          { key: "revision" as const, label: "Revision" },
                          { key: "final" as const, label: "Final Measure" }
                        ].map((stage) => (
                          <button
                            key={stage.key}
                            className={quoteStage === stage.key ? "button" : "button button-subtle"}
                            onClick={() => {
                              setQuoteStage(stage.key);
                              if (stage.key === "revision" && quotationRevisions.length > 0 && !selectedRevisionId) {
                                setSelectedRevisionId(quotationRevisions[quotationRevisions.length - 1].id);
                              }
                            }}
                            type="button"
                          >
                            {stage.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {quoteStage === "initial" || quoteStage === "revision" ? (
                      <>
                        <div className="panel" style={{ padding: 20 }}>
                          <div style={{ fontWeight: 800, marginBottom: 16 }}>{quoteStage === "initial" ? "Initial quote" : "Revision quote"}</div>
                          {quoteStage === "revision" ? (
                            activeRevision ? (
                              <div className="stack">
                                <label className="field">
                                  <span>Revision dropdown</span>
                                  <select className="input" onChange={(event) => setSelectedRevisionId(event.target.value)} value={selectedRevisionId}>
                                    {quotationRevisions.map((revision) => (
                                      <option key={revision.id} value={revision.id}>{revision.label}</option>
                                    ))}
                                  </select>
                                </label>
                                {canManage ? (
                                  <>
                                    <TextField label="Reference" onChange={(value) => updateRevisionField(activeRevision.id, (revision) => ({ ...revision, reference: value }))} value={activeRevision.reference} />
                                    <TextAreaField label="Scope of works" onChange={(value) => updateRevisionField(activeRevision.id, (revision) => ({ ...revision, scope: value }))} value={activeRevision.scope} />
                                    <TextAreaField label="Assumptions" onChange={(value) => updateRevisionField(activeRevision.id, (revision) => ({ ...revision, assumptions: value }))} value={activeRevision.assumptions} />
                                    <TextAreaField label="Exclusions" onChange={(value) => updateRevisionField(activeRevision.id, (revision) => ({ ...revision, exclusions: value }))} value={activeRevision.exclusions} />
                                    <TextAreaField label="Revision notes" onChange={(value) => updateRevisionField(activeRevision.id, (revision) => ({ ...revision, note: value }))} value={activeRevision.note} />
                                    <QuoteItemSelector
                                      contractId={activeRevision.contractId}
                                      emptyMessage="No rate items match this search."
                                      onAddItem={(itemId) => addQuoteItemToRevisionFromLibrary(activeRevision.id, itemId)}
                                      quoteItems={quoteItems}
                                      searchTerm={revisionQuoteItemSearchTerm}
                                      setSearchTerm={setRevisionQuoteItemSearchTerm}
                                    />
                                    <button className="button button-subtle" onClick={() => addRevisionItem(activeRevision.id)} type="button">Add custom item</button>
                                  </>
                                ) : (
                                  <div className="stack">
                                    <div className="panel" style={{ padding: 16 }}><div className="muted">Revision</div><div style={{ fontWeight: 700 }}>{activeRevision.label}</div></div>
                                    <div className="panel" style={{ padding: 16 }}><div className="muted">Reference</div><div style={{ fontWeight: 700 }}>{activeRevision.reference || "Not set"}</div></div>
                                    <div className="panel" style={{ padding: 16, whiteSpace: "pre-wrap" }}><div className="muted">Scope</div><div style={{ fontWeight: 700 }}>{activeRevision.scope || "Not set"}</div></div>
                                    <div className="panel" style={{ padding: 16, whiteSpace: "pre-wrap" }}><div className="muted">Revision notes</div><div style={{ fontWeight: 700 }}>{activeRevision.note || "Not set"}</div></div>
                                    <div className="panel" style={{ padding: 16 }}><div className="muted">Quoted total</div><div style={{ fontWeight: 700 }}>{activeRevision.totalAmount || "Not set"}</div></div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="stack">
                                <div className="muted">No revisions yet.</div>
                                {canManage ? <button className="button button-subtle" onClick={createRevisionFromBase} type="button">Create {getNextRevisionLabel()}</button> : null}
                              </div>
                            )
                          ) : canManage ? (
                            <div className="stack">
                              <label className="field">
                                <span>Rate list dropdown</span>
                                <select
                                  className="input"
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setQuotation((current) => {
                                      const nextItems = current.items.map((item) => {
                                        const matchedItem = item.sourceItemId ? quoteItems.find((entry) => entry.id === item.sourceItemId) : undefined;
                                        return matchedItem ? { ...item, unitPrice: getCatalogRate(matchedItem, value) } : item;
                                      });

                                      return {
                                        ...current,
                                        contractId: value,
                                        items: nextItems,
                                        totalAmount: calculateQuoteTotal(nextItems).toFixed(2)
                                      };
                                    });
                                  }}
                                  value={quotation.contractId}
                                >
                                  <option value="">Choose a rate list</option>
                                  {contracts.map((contract) => (
                                    <option key={contract.id} value={contract.id}>{contract.name}</option>
                                  ))}
                                </select>
                                <span className="muted" style={{ fontSize: 12 }}>Select the customer rate list from the dropdown.</span>
                              </label>
                              <TextField label="Reference" onChange={(value) => setQuotation((current) => ({ ...current, reference: value }))} value={quotation.reference} />
                              <TextAreaField label="Scope of works" onChange={(value) => setQuotation((current) => ({ ...current, scope: value }))} value={quotation.scope} />
                              <TextAreaField label="Assumptions" onChange={(value) => setQuotation((current) => ({ ...current, assumptions: value }))} value={quotation.assumptions} />
                              <TextAreaField label="Exclusions" onChange={(value) => setQuotation((current) => ({ ...current, exclusions: value }))} value={quotation.exclusions} />
                              <QuoteItemSelector
                                contractId={quotation.contractId}
                                emptyMessage="No rate items match this search."
                                onAddItem={addQuoteItemFromLibrary}
                                quoteItems={quoteItems}
                                searchTerm={quoteItemSearchTerm}
                                setSearchTerm={setQuoteItemSearchTerm}
                              />
                              <button className="button button-subtle" onClick={addQuotationItem} type="button">Add custom item</button>
                            </div>
                          ) : (
                            <div className="stack">
                              <div className="panel" style={{ padding: 16 }}><div className="muted">Rate list</div><div style={{ fontWeight: 700 }}>{getRateListName(contracts, quotation.contractId)}</div></div>
                              <div className="panel" style={{ padding: 16 }}><div className="muted">Reference</div><div style={{ fontWeight: 700 }}>{quotation.reference || "Not set"}</div></div>
                              <div className="panel" style={{ padding: 16, whiteSpace: "pre-wrap" }}><div className="muted">Scope</div><div style={{ fontWeight: 700 }}>{quotation.scope || "Not set"}</div></div>
                              <div className="panel" style={{ padding: 16 }}><div className="muted">Quoted total</div><div style={{ fontWeight: 700 }}>{quotation.totalAmount || "Not set"}</div></div>
                            </div>
                          )}
                        </div>

                        <div className="panel" style={{ padding: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 800 }}>{quoteStage === "initial" ? "Initial quote items" : "Revision items"}</div>
                            {canManage && quoteStage === "initial" ? <button className="button button-subtle" onClick={addQuotationItem} type="button">Add line item</button> : null}
                          </div>
                          <div className="stack">
                            {(quoteStage === "revision" && activeRevision ? activeRevision.items : quotation.items).map((item) => (
                              <div key={item.id} className="panel" style={{ padding: 16 }}>
                                {canManage && quoteStage === "initial" ? (
                                  <div className="stack">
                                    <TextField label="Title" onChange={(value) => updateQuotationItem(item.id, "title", value)} value={item.title} />
                                    <TextAreaField label="Description" onChange={(value) => updateQuotationItem(item.id, "description", value)} value={item.description} />
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                                      <TextField label="Quantity" onChange={(value) => updateQuotationItem(item.id, "quantity", value)} value={item.quantity} />
                                      <TextField label="Unit" onChange={(value) => updateQuotationItem(item.id, "unit", value)} value={item.unit} />
                                      <TextField label="Unit price" onChange={(value) => updateQuotationItem(item.id, "unitPrice", value)} value={item.unitPrice} />
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                                      <div className="muted">{item.code || "Custom item"}</div>
                                      <button className="button button-subtle" onClick={() => removeQuotationItem(item.id)} type="button">Remove line item</button>
                                    </div>
                                  </div>
                                ) : canManage && quoteStage === "revision" && activeRevision ? (
                                  <div className="stack">
                                    <TextField label="Title" onChange={(value) => updateRevisionItem(activeRevision.id, item.id, "title", value)} value={item.title} />
                                    <TextAreaField label="Description" onChange={(value) => updateRevisionItem(activeRevision.id, item.id, "description", value)} value={item.description} />
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                                      <TextField label="Quantity" onChange={(value) => updateRevisionItem(activeRevision.id, item.id, "quantity", value)} value={item.quantity} />
                                      <TextField label="Unit" onChange={(value) => updateRevisionItem(activeRevision.id, item.id, "unit", value)} value={item.unit} />
                                      <TextField label="Unit price" onChange={(value) => updateRevisionItem(activeRevision.id, item.id, "unitPrice", value)} value={item.unitPrice} />
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                                      <div className="muted">{item.code || "Custom item"}</div>
                                      <button className="button button-subtle" onClick={() => removeRevisionItem(activeRevision.id, item.id)} type="button">Remove line item</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="stack" style={{ gap: 8 }}>
                                    <div style={{ fontWeight: 700 }}>{item.title || "Untitled item"}</div>
                                    <div className="muted" style={{ whiteSpace: "pre-wrap" }}>{item.description || "No description."}</div>
                                    <div>{item.quantity} {item.unit} at {item.unitPrice}</div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {canManage ? (
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {quoteStage === "initial" ? <button className="button button-subtle" onClick={createRevisionFromBase} type="button">Create {getNextRevisionLabel()}</button> : null}
                            <button className="button" onClick={handleSave} type="button">{quoteStage === "initial" ? "Save Initial Quote" : "Save Revision"}</button>
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {quoteStage === "final" ? (
                      <>
                        <div className="panel" style={{ padding: 20 }}>
                          <div style={{ fontWeight: 800, marginBottom: 16 }}>Final measure</div>
                          {latestRevision ? (
                            <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
                              <div className="muted">Based on latest revision</div>
                              <div style={{ fontWeight: 700 }}>{latestRevision.label}</div>
                              <div className="muted" style={{ marginTop: 8 }}>Reference: {latestRevision.reference || "Not set"}</div>
                              <div className="muted">Revision value: {latestRevision.totalAmount || "Not set"}</div>
                            </div>
                          ) : (
                            <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
                              <div className="muted">No revisions available yet. Final measure will use the initial quote until a revision exists.</div>
                            </div>
                          )}
                          {canManage ? (
                            <div className="stack">
                              <TextField label="Measured by" onChange={(value) => setFinalMeasure((current) => ({ ...current, measuredBy: value }))} value={finalMeasure.measuredBy} />
                              <TextField label="Measured on" onChange={(value) => setFinalMeasure((current) => ({ ...current, measuredOn: value }))} type="date" value={finalMeasure.measuredOn} />
                              <TextAreaField label="Measure summary" onChange={(value) => setFinalMeasure((current) => ({ ...current, summary: value }))} value={finalMeasure.summary} />
                              <TextField label="Measured total value" onChange={(value) => setFinalMeasure((current) => ({ ...current, totalMeasuredValue: value }))} value={finalMeasure.totalMeasuredValue} />
                            </div>
                          ) : (
                            <div className="stack">
                              <div className="panel" style={{ padding: 16 }}><div className="muted">Measured by</div><div style={{ fontWeight: 700 }}>{finalMeasure.measuredBy || "Not set"}</div></div>
                              <div className="panel" style={{ padding: 16 }}><div className="muted">Measured on</div><div style={{ fontWeight: 700 }}>{finalMeasure.measuredOn || "Not set"}</div></div>
                              <div className="panel" style={{ padding: 16, whiteSpace: "pre-wrap" }}><div className="muted">Summary</div><div style={{ fontWeight: 700 }}>{finalMeasure.summary || "Not set"}</div></div>
                              <div className="panel" style={{ padding: 16 }}><div className="muted">Final value</div><div style={{ fontWeight: 700 }}>{finalMeasure.totalMeasuredValue || "Not set"}</div></div>
                            </div>
                          )}
                        </div>

                        {canManage ? (
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <button className="button" onClick={handleSave} type="button">Save Final Measure</button>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  <div className="stack">
                    {quoteStage === "revision" ? (
                      <div className="panel" style={{ padding: 20 }}>
                        <div style={{ fontWeight: 800, marginBottom: 12 }}>Revision register</div>
                        {canManage ? (
                          <div className="stack" style={{ marginBottom: 16 }}>
                            <button className="button button-subtle" onClick={createRevisionFromBase} type="button">Create {getNextRevisionLabel()}</button>
                          </div>
                        ) : null}
                        <div className="stack" style={{ gap: 12 }}>
                          {quotationRevisions.length === 0 ? <div className="muted">No quotation revisions saved yet.</div> : null}
                          {quotationRevisions.map((revision) => (
                            <div key={revision.id} className="panel" style={{ padding: 14 }}>
                              <div style={{ fontWeight: 700 }}>{revision.label}</div>
                              <div className="muted">{formatDateLabel(revision.createdAt)}</div>
                              <div style={{ marginTop: 8 }}>Total: {revision.totalAmount || "Not set"}</div>
                              <div className="muted" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{revision.note || "No revision note."}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {visibleActiveTab === "external" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 24 }}>
                  <div className="stack">
                    {canManage ? (
                      <>
                        <TextAreaField
                          label="External Info"
                          onChange={(value) => setForm((current) => ({ ...current, externalInfo: value }))}
                          value={form.externalInfo}
                        />
                        <label className="field">
                          <span>External files</span>
                          <input
                            className="input"
                            disabled={uploadingDocumentArea === "EXTERNAL"}
                            onChange={(event) => {
                              const [file] = Array.from(event.target.files ?? []);
                              void handleUploadDocument("EXTERNAL", file ?? null);
                              event.currentTarget.value = "";
                            }}
                            type="file"
                          />
                        </label>
                        <button className="button" onClick={handleSave} type="button">Save External Info</button>
                      </>
                    ) : (
                      <>
                        <div className="panel" style={{ padding: 20, minHeight: 260, whiteSpace: "pre-wrap" }}>
                          {form.externalInfo || "No information has been added for this job yet."}
                        </div>
                      </>
                    )}
                    <div className="panel" style={{ padding: 20 }}>
                      <div style={{ fontWeight: 800, marginBottom: 12 }}>{canManage ? "External files" : "Files"}</div>
                      <div className="stack" style={{ gap: 12 }}>
                        {externalDocuments.length === 0 ? <div className="muted">No external files attached.</div> : null}
                        {externalDocuments.map((document) => (
                          <div key={document.id} className="panel" style={{ padding: 14 }}>
                            <div style={{ fontWeight: 700 }}>{document.name}</div>
                            <div className="muted">{document.mimeType}</div>
                            <button
                              className="button button-subtle"
                              disabled={openingDocumentId === document.id}
                              onClick={() => void handleOpenJobDocument(document.id, document.name)}
                              style={{ marginTop: 10 }}
                              type="button"
                            >
                              Open File
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="panel" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 12 }}>{canManage ? "Visible to operatives" : "Job summary"}</div>
                    <div className="stack" style={{ gap: 12 }}>
                      <div className="callout">Use this for site notes, work scope, traffic management instructions, and anything the crew needs on the day.</div>
                      <div>
                        <div className="muted">Current job</div>
                        <div style={{ fontWeight: 700 }}>{form.companyJobNumber || "-"}</div>
                      </div>
                      <div>
                        <div className="muted">Site</div>
                        <div style={{ fontWeight: 700 }}>{form.siteAddress || "Not set"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {visibleActiveTab === "internal" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 24 }}>
                  <div className="stack">
                    <TextAreaField
                      label="Internal Info"
                      onChange={(value) => setForm((current) => ({ ...current, internalInfo: value }))}
                      value={form.internalInfo}
                    />
                    <label className="field">
                      <span>Internal files</span>
                      <input
                        className="input"
                        disabled={uploadingDocumentArea === "INTERNAL"}
                        onChange={(event) => {
                          const [file] = Array.from(event.target.files ?? []);
                          void handleUploadDocument("INTERNAL", file ?? null);
                          event.currentTarget.value = "";
                        }}
                        type="file"
                      />
                    </label>
                    <div className="panel" style={{ padding: 20 }}>
                      <div style={{ fontWeight: 800, marginBottom: 12 }}>Internal files</div>
                      <div className="stack" style={{ gap: 12 }}>
                        {internalDocuments.length === 0 ? <div className="muted">No internal files attached.</div> : null}
                        {internalDocuments.map((document) => (
                          <div key={document.id} className="panel" style={{ padding: 14 }}>
                            <div style={{ fontWeight: 700 }}>{document.name}</div>
                            <div className="muted">{document.mimeType}</div>
                            <button
                              className="button button-subtle"
                              disabled={openingDocumentId === document.id}
                              onClick={() => void handleOpenJobDocument(document.id, document.name)}
                              style={{ marginTop: 10 }}
                              type="button"
                            >
                              Open File
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button className="button" onClick={handleSave} type="button">Save Internal Info</button>
                  </div>
                  <div className="panel" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, marginBottom: 12 }}>Manager only</div>
                    <div className="stack" style={{ gap: 12 }}>
                      <div className="callout">Use this area for commercial notes, access issues, client sensitivities, and internal planning only.</div>
                      <div>
                        <div className="muted">Customer job number</div>
                        <div style={{ fontWeight: 700 }}>{form.customerJobNumber || "Not set"}</div>
                      </div>
                      <div>
                        <div className="muted">Status</div>
                        <div style={{ fontWeight: 700 }}>{form.status}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {visibleActiveTab === "schedule" ? (
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
                            {canManage ? <button className="assignment-pill-remove" onClick={() => removeScheduledDay(day)} type="button">Remove</button> : null}
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
                      {canManage && overlapWarnings.length > 0 ? (
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
                    <div className="field">
                      <span>Assigned vehicles</span>
                      {canManage ? (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                        <label className="field" style={{ flex: "1 1 260px" }}>
                          <span>Select vehicle</span>
                          <select className="input" onChange={(event) => setSelectedVehicleId(event.target.value)} value={selectedVehicleId}>
                            <option value="">Choose a vehicle</option>
                            {vehicleOptions.map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.id}>
                                {vehicle.name} {vehicle.registrationNumber ? `(${vehicle.registrationNumber})` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="button button-subtle" onClick={addVehicle} type="button">Assign Vehicle</button>
                      </div>
                      ) : null}
                      {canManage && vehicleOverlapWarnings.length > 0 ? (
                        <div className="error-banner">
                          {vehicleOverlapWarnings.map((warning) => (
                            <div key={`${warning.day}-${warning.vehicleId}-${warning.companyJobNumber}`}>
                              {warning.vehicleName} overlaps with {warning.companyJobNumber} ({warning.jobTitle}) on {new Date(`${warning.day}T00:00:00`).toLocaleDateString()}.
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {form.assignedVehicleIds.length === 0 ? <div className="muted">No vehicles assigned.</div> : null}
                        {form.assignedVehicleIds.map((vehicleId) => {
                          const vehicle = vehicleOptions.find((entry) => entry.id === vehicleId);
                          return (
                            <div key={vehicleId} className="assignment-pill">
                              <span>{vehicle?.name ?? vehicleId}{vehicle?.registrationNumber ? ` (${vehicle.registrationNumber})` : ""}</span>
                              {canManage ? <button className="assignment-pill-remove" onClick={() => removeVehicle(vehicleId)} type="button">Remove</button> : null}
                            </div>
                          );
                        })}
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
                      <div>
                        <div className="muted">Vehicles</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {form.assignedVehicleIds.length === 0 ? <div>No vehicles assigned</div> : null}
                          {form.assignedVehicleIds.map((vehicleId) => {
                            const vehicle = vehicleOptions.find((entry) => entry.id === vehicleId);
                            return (
                              <div key={vehicleId}>
                                {vehicle?.name ?? vehicleId}{vehicle?.registrationNumber ? ` (${vehicle.registrationNumber})` : ""}
                              </div>
                            );
                          })}
                        </div>
                      </div>
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

export function CalendarPage() {
  const { jobs, users, error, reload } = useJobsAndUsers();
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
          reload={reload}
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
  reload,
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
  reload: () => Promise<void>;
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
  const [bulkEditJobId, setBulkEditJobId] = useState<string | null>(null);
  const [bulkEditAssignments, setBulkEditAssignments] = useState<Record<string, string[]>>({});
  const [bulkEditScheduledDays, setBulkEditScheduledDays] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  const [year, month] = calendarMonth.split("-").map((part) => Number(part));
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const operativeUsers = users.filter((user) => user.role === "OPERATIVE");
  const boardUsers = isManager ? operativeUsers : operativeUsers.filter((user) => user.id === session.user.sub);
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

  useEffect(() => {
    if (!bulkEditJobId) {
      return;
    }

    const matchingJob = jobs.find((entry) => entry.id === bulkEditJobId);
    if (!matchingJob) {
      setBulkEditJobId(null);
      setBulkEditAssignments({});
      setBulkEditScheduledDays([]);
    }
  }, [bulkEditJobId, jobs]);

  function getWorkingAssignments(job: JobRecord) {
    if (job.id !== bulkEditJobId) {
      return getJobDailyAssignments(job);
    }

    return bulkEditAssignments;
  }

  function jobsForEmployeeOnDay(userId: string, day: string) {
    return jobs.filter((job) => (getWorkingAssignments(job)[day] ?? []).includes(userId));
  }

  function hasCalendarConflict(job: JobRecord, day: string, userId?: string) {
    const currentUsers = userId ? [userId] : (getWorkingAssignments(job)[day] ?? []);
    const operativeConflict = currentUsers.some((currentUserId) => (
      jobs.some((candidate) => (
        candidate.id !== job.id &&
        (getWorkingAssignments(candidate)[day] ?? []).includes(currentUserId) &&
        jobsOverlapByTime(job, candidate)
      ))
    ));

    if (operativeConflict) {
      return true;
    }

    return (job.assignedVehicleIds ?? []).some((vehicleId) => (
      jobs.some((candidate) => (
        candidate.id !== job.id &&
        (candidate.assignedVehicleIds ?? []).includes(vehicleId) &&
        (candidate.scheduledDays ?? []).includes(day) &&
        jobsOverlapByTime(job, candidate)
      ))
    ));
  }

  const visibleJobsForBoard = selectedEmployeeId === "all"
    ? jobsForMonth
    : jobsForMonth.filter((job) =>
        Object.values(getWorkingAssignments(job)).some((assignedUsers) => assignedUsers.includes(selectedEmployeeId))
      );

  const showTeamWeek = !isManager || (selectedEmployeeId === "all" && calendarMode === "team-week");
  const bulkEditJob = bulkEditJobId ? jobs.find((entry) => entry.id === bulkEditJobId) ?? null : null;

  function beginBulkEdit(job: JobRecord) {
    setBulkEditJobId(job.id);
    setBulkEditAssignments(
      Object.fromEntries(
        getScheduledDaysForJob(job).map((day) => [day, [...getAssignedUsersForDay(job, day)]])
      )
    );
    setBulkEditScheduledDays(getScheduledDaysForJob(job));
    setBulkError(null);
    setBulkSuccess(null);
  }

  function cancelBulkEdit() {
    setBulkEditJobId(null);
    setBulkEditAssignments({});
    setBulkEditScheduledDays([]);
    setBulkError(null);
  }

  function toggleBulkAssignment(job: JobRecord, userId: string, day: string) {
    if (job.id !== bulkEditJobId) {
      return;
    }

    setBulkError(null);
    setBulkSuccess(null);
    setBulkEditAssignments((current) => {
      const dayAssignments = current[day] ?? [];
      const nextAssignments = dayAssignments.includes(userId)
        ? dayAssignments.filter((entry) => entry !== userId)
        : [...dayAssignments, userId];

      return {
        ...current,
        [day]: nextAssignments
      };
    });
    setBulkEditScheduledDays((current) => (
      current.includes(day) ? current : [...current, day].sort()
    ));
  }

  async function saveBulkEdit() {
    if (!bulkEditJob) {
      return;
    }

    setBulkSaving(true);
    setBulkError(null);
    setBulkSuccess(null);

    try {
      const scheduledDays = [...bulkEditScheduledDays].sort();
      await apiRequest(`jobs/${bulkEditJob.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduledDays,
          scheduledFor: scheduledDays[0] ? `${scheduledDays[0]}T00:00:00` : undefined,
          scheduledTo: scheduledDays[scheduledDays.length - 1] ? `${scheduledDays[scheduledDays.length - 1]}T23:59:59` : undefined,
          dailyAssignments: Object.fromEntries(
            scheduledDays.map((day) => [day, bulkEditAssignments[day] ?? []])
          )
        })
      });
      setBulkSuccess("Job assignment changes saved.");
      await reload();
      cancelBulkEdit();
    } catch (caughtError) {
      setBulkError(caughtError instanceof Error ? caughtError.message : "Failed to save job assignment changes.");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <article className="panel" style={{ padding: 24 }}>
          <ErrorText error={error} />
          <ErrorText error={bulkError} />
          {bulkSuccess ? <div className="panel" style={{ padding: 18, borderRadius: 18, marginBottom: 16 }}>{bulkSuccess}</div> : null}
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
          {showTeamWeek && isManager ? (
            <div className="panel" style={{ padding: 16, marginTop: 18 }}>
              {bulkEditJob ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>Assignment mode: {bulkEditJob.companyJobNumber}</div>
                    <div className="muted">Click any day/operative cell to add or remove this job there, then press Done.</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="button" disabled={bulkSaving} onClick={() => void saveBulkEdit()} type="button">Done</button>
                    <button className="button button-subtle" disabled={bulkSaving} onClick={cancelBulkEdit} type="button">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="muted">Right-click a job on the Team Week board to start copy/paste assignment mode.</div>
              )}
            </div>
          ) : null}
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
                {boardUsers.map((user) => (
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
                          onClick={() => {
                            if (!bulkEditJob) {
                              return;
                            }

                            toggleBulkAssignment(bulkEditJob, user.id, dayKey);
                          }}
                          style={bulkEditJob ? { cursor: "copy", outline: (getWorkingAssignments(bulkEditJob)[dayKey] ?? []).includes(user.id) ? "2px solid rgba(96, 165, 250, 0.65)" : "1px dashed rgba(148, 163, 184, 0.45)" } : undefined}
                        >
                          {dayJobs.length === 0 ? <div className="schedule-board-empty">-</div> : null}
                          {dayJobs.map((job) => (
                            <Link
                              key={job.id}
                              className="schedule-job-chip"
                              href={jobDetailHref(job.id, "schedule")}
                              onClick={(event) => {
                                if (!bulkEditJob) {
                                  return;
                                }

                                event.preventDefault();
                              }}
                              onContextMenu={(event) => {
                                if (!isManager) {
                                  return;
                                }

                                event.preventDefault();
                                beginBulkEdit(job);
                              }}
                              style={getJobVisualStyle(job, hasCalendarConflict(job, dayKey, user.id))}
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
                              style={getJobVisualStyle(job, hasCalendarConflict(job, dayKey))}
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

function AssetManagementWorkspace({
  title,
  description,
  kind,
  excludeKind,
  itemLabel,
  emptyMessage
}: Readonly<{
  title: string;
  description: string;
  kind?: string;
  excludeKind?: string;
  itemLabel: string;
  emptyMessage: string;
}>) {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const emptyForm = {
    name: "",
    serialNumber: "",
    registrationNumber: "",
    assetStatus: "ACTIVE",
    notes: "",
    lastServicedAt: "",
    nextServiceDueAt: ""
  };
  const [form, setForm] = useState(emptyForm);

  async function load() {
    try {
      const items = await apiRequest<AssetRecord[]>("assets");
      setAssets(
        items.filter((item) => {
          const itemKind = item.kind ?? "GENERAL";
          if (kind) {
            return itemKind === kind;
          }

          if (excludeKind) {
            return itemKind !== excludeKind;
          }

          return true;
        })
      );
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Failed to load ${title.toLowerCase()}.`);
    }
  }

  useEffect(() => { void load(); }, []);

  function beginEdit(asset: AssetRecord) {
    setEditingAssetId(asset.id);
    setForm({
      name: asset.name ?? "",
      serialNumber: asset.serialNumber ?? "",
      registrationNumber: asset.registrationNumber ?? "",
      assetStatus: asset.assetStatus ?? "ACTIVE",
      notes: asset.notes ?? "",
      lastServicedAt: asset.lastServicedAt ? asset.lastServicedAt.slice(0, 10) : "",
      nextServiceDueAt: asset.nextServiceDueAt ? asset.nextServiceDueAt.slice(0, 10) : ""
    });
  }

  function resetForm() {
    setEditingAssetId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest(editingAssetId ? `assets/${editingAssetId}` : "assets", {
        method: editingAssetId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...form,
          kind,
          lastServicedAt: form.lastServicedAt ? `${form.lastServicedAt}T00:00:00` : null,
          nextServiceDueAt: form.nextServiceDueAt ? `${form.nextServiceDueAt}T00:00:00` : null
        })
      });
      resetForm();
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Failed to save ${title.toLowerCase()}.`);
    }
  }

  async function handleDelete(assetId: string) {
    try {
      await apiRequest(`assets/${assetId}`, { method: "DELETE" });
      if (editingAssetId === assetId) {
        resetForm();
      }
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Failed to remove ${title.toLowerCase()}.`);
    }
  }

  return (
    <ProtectedWorkspace allow="tenant" description={description} title={title}>
      {(session) => {
        const canManage = canManageWorkspace(session.user.role);
        if (!canManage) {
          return <div className="panel" style={{ padding: 24 }}>Only managers can manage assets.</div>;
        }

        return (
          <PanelGrid>
            <article className="panel" style={{ padding: 24 }}>
              <h2 style={{ marginTop: 0 }}>{editingAssetId ? `Edit ${itemLabel}` : `Add ${itemLabel}`}</h2>
              <form className="stack" onSubmit={handleSubmit}>
                <TextField label={`${itemLabel} name`} onChange={(value) => setForm((current) => ({ ...current, name: value }))} value={form.name} />
                <TextField label="Serial / asset number" onChange={(value) => setForm((current) => ({ ...current, serialNumber: value }))} value={form.serialNumber} />
                <TextField label="Registration / tag" onChange={(value) => setForm((current) => ({ ...current, registrationNumber: value }))} value={form.registrationNumber} />
                <SelectField label="Status" onChange={(value) => setForm((current) => ({ ...current, assetStatus: value }))} options={["ACTIVE", "IN_SERVICE", "OFF_HIRE", "REPAIR", "RETIRED"]} value={form.assetStatus} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <TextField label="Last serviced" onChange={(value) => setForm((current) => ({ ...current, lastServicedAt: value }))} type="date" value={form.lastServicedAt} />
                  <TextField label="Next service due" onChange={(value) => setForm((current) => ({ ...current, nextServiceDueAt: value }))} type="date" value={form.nextServiceDueAt} />
                </div>
                <TextAreaField label="Notes" onChange={(value) => setForm((current) => ({ ...current, notes: value }))} value={form.notes} />
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button className="button" type="submit">{editingAssetId ? "Save Changes" : `Create ${itemLabel}`}</button>
                  {editingAssetId ? <button className="button button-subtle" onClick={resetForm} type="button">Cancel Edit</button> : null}
                </div>
              </form>
              <ErrorText error={error} />
            </article>
            <article className="panel" style={{ padding: 24 }}>
              <h2 style={{ marginTop: 0 }}>{title}</h2>
              <div className="stack">
                {assets.length === 0 ? <div className="muted">{emptyMessage}</div> : null}
                {assets.map((asset) => (
                  <div key={asset.id} className="panel" style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{asset.name}</div>
                        <div className="muted">{asset.registrationNumber || asset.serialNumber}</div>
                      </div>
                      <div className="badge">{asset.assetStatus ?? "ACTIVE"}</div>
                    </div>
                    <div className="muted" style={{ marginTop: 10 }}>Last service: {formatDateLabel(asset.lastServicedAt)}</div>
                    <div className="muted">Next service due: {formatDateLabel(asset.nextServiceDueAt)}</div>
                    {asset.notes ? <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{asset.notes}</div> : null}
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
                      <button className="button button-subtle" onClick={() => beginEdit(asset)} type="button">Edit</button>
                      <button className="button button-danger" onClick={() => void handleDelete(asset.id)} type="button">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </PanelGrid>
        );
      }}
    </ProtectedWorkspace>
  );
}

function QuotationLibraryPanel({
  contracts,
  quoteItems,
  setContracts,
  setQuoteItems
}: Readonly<{
  contracts: ContractRecord[];
  quoteItems: QuoteCatalogItemRecord[];
  setContracts: (value: ContractRecord[] | ((current: ContractRecord[]) => ContractRecord[])) => void;
  setQuoteItems: (value: QuoteCatalogItemRecord[] | ((current: QuoteCatalogItemRecord[]) => QuoteCatalogItemRecord[])) => void;
}>) {
  const [contractForm, setContractForm] = useState({ name: "", code: "", description: "" });
  const [itemForm, setItemForm] = useState({ name: "", code: "", description: "", unit: "item", defaultRate: "0.00" });
  const [contractDrafts, setContractDrafts] = useState<Record<string, { name: string; code: string; description: string }>>({});
  const [rateDrafts, setRateDrafts] = useState<Record<string, Record<string, string>>>({});
  const [selectedContractId, setSelectedContractId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadingRates, setUploadingRates] = useState(false);
  const [savingAllRates, setSavingAllRates] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [showEditList, setShowEditList] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setContractDrafts(
      Object.fromEntries(
        contracts.map((contract) => [
          contract.id,
          { name: contract.name, code: contract.code, description: contract.description ?? "" }
        ])
      )
    );
  }, [contracts]);

  useEffect(() => {
    setSelectedContractId((current) => current && contracts.some((contract) => contract.id === current)
      ? current
      : contracts[0]?.id ?? "");
  }, [contracts]);

  useEffect(() => {
    setRateDrafts(
      Object.fromEntries(
        quoteItems.map((item) => [item.id, { ...item.contractRates }])
      )
    );
  }, [quoteItems]);

  async function createContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await apiRequest<ContractRecord>("jobs/quotation/contracts", {
        method: "POST",
        body: JSON.stringify(contractForm)
      });
      setContracts((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedContractId(created.id);
      setShowCreateList(false);
      setShowEditList(false);
      setContractForm({ name: "", code: "", description: "" });
      setSuccess("Rate list added.");
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create rate list.");
    }
  }

  async function createQuoteItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await apiRequest<QuoteCatalogItemRecord>("jobs/quotation/items", {
        method: "POST",
        body: JSON.stringify(itemForm)
      });
      setQuoteItems((current) => [...current, { ...created, contractRates: created.contractRates ?? {} }].sort((a, b) => a.name.localeCompare(b.name)));
      setShowAddItem(false);
      setItemForm({ name: "", code: "", description: "", unit: "item", defaultRate: "0.00" });
      setSuccess("Quote item added.");
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create quote item.");
    }
  }

  async function saveContract(contract: ContractRecord) {
    try {
      const updated = await apiRequest<ContractRecord>(`jobs/quotation/contracts/${contract.id}`, {
        method: "PATCH",
        body: JSON.stringify(contractDrafts[contract.id] ?? {
          name: contract.name,
          code: contract.code,
          description: contract.description
        })
      });
      setContracts((current) => current.map((entry) => entry.id === contract.id ? updated : entry).sort((a, b) => a.name.localeCompare(b.name)));
      setShowEditList(false);
      setSuccess(`Saved rate list ${updated.name}.`);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to save rate list.");
    }
  }

  async function saveQuoteItemRates(item: QuoteCatalogItemRecord) {
    try {
      const updated = await apiRequest<QuoteCatalogItemRecord>(`jobs/quotation/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: item.name,
          code: item.code,
          description: item.description,
          unit: item.unit,
          defaultRate: item.defaultRate,
          contractRates: rateDrafts[item.id] ?? {}
        })
      });
      setQuoteItems((current) => current.map((entry) => entry.id === item.id ? { ...updated, contractRates: updated.contractRates ?? {} } : entry));
      setSuccess(`Saved rates for ${item.name}.`);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to save item rates.");
    }
  }

  async function saveAllQuoteItemRates() {
    if (!selectedContract) {
      setError("Choose a rate list first.");
      return;
    }

    try {
      setSavingAllRates(true);
      const updatedItems = await Promise.all(
        visibleQuoteItems.map(async (item) => {
          const updated = await apiRequest<QuoteCatalogItemRecord>(`jobs/quotation/items/${item.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: item.name,
              code: item.code,
              description: item.description,
              unit: item.unit,
              defaultRate: item.defaultRate,
              contractRates: rateDrafts[item.id] ?? item.contractRates ?? {}
            })
          });

          return { ...updated, contractRates: updated.contractRates ?? {} };
        })
      );

      const updatedById = new Map(updatedItems.map((item) => [item.id, item]));
      setQuoteItems((current) => current.map((item) => updatedById.get(item.id) ?? item));
      setSuccess(`Saved ${updatedItems.length} row${updatedItems.length === 1 ? "" : "s"} for ${selectedContract.name}.`);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to save all item rates.");
    } finally {
      setSavingAllRates(false);
    }
  }

  async function updateQuoteItemRecord(item: QuoteCatalogItemRecord, overrides?: Partial<QuoteCatalogItemRecord>) {
    const contractRates = overrides?.contractRates ?? rateDrafts[item.id] ?? item.contractRates ?? {};
    const updated = await apiRequest<QuoteCatalogItemRecord>(`jobs/quotation/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: overrides?.name ?? item.name,
        code: overrides?.code ?? item.code,
        description: overrides?.description ?? item.description,
        unit: overrides?.unit ?? item.unit,
        defaultRate: overrides?.defaultRate ?? item.defaultRate,
        contractRates
      })
    });

    setQuoteItems((current) => current.map((entry) => entry.id === item.id ? { ...updated, contractRates: updated.contractRates ?? {} } : entry));
    return updated;
  }

  function downloadSelectedRateList() {
    const selectedContract = contracts.find((contract) => contract.id === selectedContractId);
    if (!selectedContract) {
      setError("Choose a rate list first.");
      return;
    }

    const rows = [
      ["Code", "Item", "Description", "Unit", "Default Rate", "Selected Rate"]
    ];

    quoteItems
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((item) => {
        rows.push([
          item.code,
          item.name,
          item.description ?? "",
          item.unit,
          item.defaultRate,
          rateDrafts[item.id]?.[selectedContract.id] ?? item.contractRates[selectedContract.id] ?? ""
        ]);
      });

    const blob = new Blob([buildCsvContent(rows)], { type: "text/csv;charset=utf-8;" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${selectedContract.name.replaceAll(/[^a-z0-9]+/gi, "-").replaceAll(/^-|-$/g, "").toLowerCase() || "rate-list"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    setSuccess(`Downloaded ${selectedContract.name} as CSV.`);
    setError(null);
  }

  async function importRateListFile(event: ChangeEvent<HTMLInputElement>) {
    const selectedContract = contracts.find((contract) => contract.id === selectedContractId);
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!selectedContract || !file) {
      return;
    }

    try {
      setUploadingRates(true);
      const rows = parseCsvContent(await file.text());
      if (rows.length < 2) {
        throw new Error("The spreadsheet is empty.");
      }

      const headers = rows[0].map((header) => normalizeCsvHeader(header));
      const getValue = (row: string[], ...names: string[]) => {
        const index = headers.findIndex((header) => names.includes(header));
        return index >= 0 ? (row[index] ?? "").trim() : "";
      };

      for (const row of rows.slice(1)) {
        const code = getValue(row, "code", "itemcode");
        const name = getValue(row, "item", "name", "title");
        if (!code || !name) {
          continue;
        }

        const description = getValue(row, "description");
        const unit = getValue(row, "unit");
        const defaultRate = getValue(row, "defaultrate", "default");
        const selectedRate = getValue(row, "selectedrate", "rate", "price");
        const existingItem = quoteItems.find((item) => item.code.trim().toLowerCase() === code.trim().toLowerCase());

        if (existingItem) {
          const nextContractRates = {
            ...(rateDrafts[existingItem.id] ?? existingItem.contractRates ?? {}),
            [selectedContract.id]: selectedRate
          };
          setRateDrafts((current) => ({
            ...current,
            [existingItem.id]: nextContractRates
          }));
          await updateQuoteItemRecord(existingItem, {
            name,
            description: description || existingItem.description,
            unit: unit || existingItem.unit,
            defaultRate: defaultRate || existingItem.defaultRate,
            contractRates: nextContractRates
          });
          continue;
        }

        const created = await apiRequest<QuoteCatalogItemRecord>("jobs/quotation/items", {
          method: "POST",
          body: JSON.stringify({
            name,
            code,
            description,
            unit: unit || "item",
            defaultRate: defaultRate || "0.00",
            contractRates: { [selectedContract.id]: selectedRate }
          })
        });
        setQuoteItems((current) => [...current, { ...created, contractRates: created.contractRates ?? {} }].sort((left, right) => left.name.localeCompare(right.name)));
      }

      setSuccess(`Imported spreadsheet into ${selectedContract.name}.`);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to import spreadsheet.");
    } finally {
      setUploadingRates(false);
    }
  }

  const selectedContract = contracts.find((contract) => contract.id === selectedContractId) ?? null;
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const visibleQuoteItems = normalizedSearchTerm
    ? quoteItems.filter((item) => (
      item.code.toLowerCase().includes(normalizedSearchTerm) ||
      item.name.toLowerCase().includes(normalizedSearchTerm) ||
      item.description.toLowerCase().includes(normalizedSearchTerm)
    ))
    : quoteItems;

  return (
    <div className="panel" style={{ padding: 20 }}>
      <div style={{ fontWeight: 800, marginBottom: 12 }}>Rates</div>
      <ErrorText error={error} />
      {success ? <div className="callout" style={{ marginBottom: 12 }}>{success}</div> : null}
      <div className="stack">
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 320px) minmax(220px, 1fr)", gap: 12, flex: "1 1 520px" }}>
              <label className="field">
                <span>Rate list dropdown</span>
                <select className="input" onChange={(event) => setSelectedContractId(event.target.value)} value={selectedContractId}>
                  <option value="">Choose a rate list</option>
                  {contracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>{contract.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Search items</span>
                <input className="input" onChange={(event) => setSearchTerm(event.target.value)} placeholder="Code, item, or description" type="search" value={searchTerm} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                className="button button-subtle"
                onClick={() => {
                  setShowCreateList((current) => !current);
                  setShowEditList(false);
                  setShowAddItem(false);
                }}
                type="button"
              >
                Create New List
              </button>
              <button
                className="button button-subtle"
                disabled={!selectedContract}
                onClick={() => {
                  if (!selectedContract) {
                    return;
                  }
                  setShowEditList((current) => !current);
                  setShowCreateList(false);
                  setShowAddItem(false);
                }}
                type="button"
              >
                Edit Current List
              </button>
              <button
                className="button button-subtle"
                disabled={!selectedContract}
                onClick={() => {
                  if (!selectedContract) {
                    return;
                  }
                  setShowAddItem((current) => !current);
                  setShowCreateList(false);
                  setShowEditList(false);
                }}
                type="button"
              >
                Add Item To The List
              </button>
            </div>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            {selectedContract
              ? `Editing ${selectedContract.name}. Download it as CSV, edit it in Excel, then upload it back into the same list.`
              : "Choose a rate list to view and edit its spreadsheet."}
          </div>
        </div>

        {showEditList ? (
          <div className="panel" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700 }}>Edit current list</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="button button-subtle" onClick={downloadSelectedRateList} type="button">Download CSV</button>
                <label
                  className="button button-subtle"
                  style={{
                    justifyContent: "center",
                    cursor: uploadingRates || !selectedContract ? "not-allowed" : "pointer",
                    opacity: !selectedContract ? 0.6 : 1
                  }}
                >
                  {uploadingRates ? "Uploading..." : "Upload CSV"}
                  <input accept=".csv,text/csv" disabled={!selectedContract || uploadingRates} hidden onChange={(event) => void importRateListFile(event)} type="file" />
                </label>
              </div>
            </div>
            {selectedContract ? (
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr auto", gap: 12, alignItems: "start" }}>
                <input
                  className="input"
                  onChange={(event) => setContractDrafts((current) => ({
                    ...current,
                    [selectedContract.id]: {
                      ...(current[selectedContract.id] ?? { name: selectedContract.name, code: selectedContract.code, description: selectedContract.description ?? "" }),
                      name: event.target.value
                    }
                  }))}
                  value={contractDrafts[selectedContract.id]?.name ?? selectedContract.name}
                />
                <input
                  className="input"
                  onChange={(event) => setContractDrafts((current) => ({
                    ...current,
                    [selectedContract.id]: {
                      ...(current[selectedContract.id] ?? { name: selectedContract.name, code: selectedContract.code, description: selectedContract.description ?? "" }),
                      code: event.target.value
                    }
                  }))}
                  value={contractDrafts[selectedContract.id]?.code ?? selectedContract.code}
                />
                <textarea
                  className="input"
                  onChange={(event) => setContractDrafts((current) => ({
                    ...current,
                    [selectedContract.id]: {
                      ...(current[selectedContract.id] ?? { name: selectedContract.name, code: selectedContract.code, description: selectedContract.description ?? "" }),
                      description: event.target.value
                    }
                  }))}
                  rows={2}
                  value={contractDrafts[selectedContract.id]?.description ?? selectedContract.description ?? ""}
                />
                <button className="button button-subtle" onClick={() => void saveContract(selectedContract)} type="button">Save List</button>
              </div>
            ) : (
              <div className="muted">No rate list selected.</div>
            )}
          </div>
        ) : null}

        {showCreateList ? (
          <form className="panel stack" onSubmit={createContract} style={{ padding: 16 }}>
            <div style={{ fontWeight: 700 }}>Create new list</div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr auto", gap: 12, alignItems: "start" }}>
              <input className="input" onChange={(event) => setContractForm((current) => ({ ...current, name: event.target.value }))} placeholder="Customer or rate list name" value={contractForm.name} />
              <input className="input" onChange={(event) => setContractForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" value={contractForm.code} />
              <textarea className="input" onChange={(event) => setContractForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" rows={2} value={contractForm.description} />
              <button className="button button-subtle" type="submit">Create List</button>
            </div>
          </form>
        ) : null}

        {showAddItem ? (
          <form className="panel stack" onSubmit={createQuoteItem} style={{ padding: 16 }}>
            <div style={{ fontWeight: 700 }}>Add item to {selectedContract?.name || "list"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "180px 2fr 2fr 110px 110px auto", gap: 12, alignItems: "start" }}>
              <input className="input" onChange={(event) => setItemForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" value={itemForm.code} />
              <input className="input" onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} placeholder="Item name" value={itemForm.name} />
              <textarea className="input" onChange={(event) => setItemForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" rows={2} value={itemForm.description} />
              <input className="input" onChange={(event) => setItemForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Unit" value={itemForm.unit} />
              <input className="input" onChange={(event) => setItemForm((current) => ({ ...current, defaultRate: event.target.value }))} placeholder="Default" value={itemForm.defaultRate} />
              <button className="button button-subtle" type="submit">Add Item</button>
            </div>
          </form>
        ) : null}

        <div className="panel" style={{ padding: 12, overflowX: "auto" }}>
          <div style={{ minWidth: 1120 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 260px 320px 100px 100px 120px 140px",
                gap: 12,
                padding: "0 0 10px",
                borderBottom: "1px solid var(--line)",
                fontWeight: 700,
                alignItems: "center"
              }}
            >
              <div>Code</div>
              <div>Item</div>
              <div>Description</div>
              <div>Unit</div>
              <div>Default</div>
              <div>{selectedContract ? `${selectedContract.name} Rate` : "Rate"}</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="button button-subtle"
                  disabled={!selectedContract || savingAllRates || visibleQuoteItems.length === 0}
                  onClick={() => void saveAllQuoteItemRates()}
                  type="button"
                >
                  {savingAllRates ? "Saving..." : "Save All Rows"}
                </button>
              </div>
            </div>
            {visibleQuoteItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 260px 320px 100px 100px 120px 140px",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: "1px solid var(--line)",
                  alignItems: "center"
                }}
              >
                <div>{item.code}</div>
                <div>{item.name}</div>
                <div title={item.description}>{item.description || "-"}</div>
                <div>{item.unit}</div>
                <div>{item.defaultRate}</div>
                <input
                  className="input"
                  disabled={!selectedContract}
                  onChange={(event) => {
                    if (!selectedContract) {
                      return;
                    }
                    setRateDrafts((current) => ({
                      ...current,
                      [item.id]: {
                        ...(current[item.id] ?? {}),
                        [selectedContract.id]: event.target.value
                      }
                    }));
                  }}
                  value={selectedContract ? (rateDrafts[item.id]?.[selectedContract.id] ?? item.contractRates[selectedContract.id] ?? "") : ""}
                />
                <div className="muted" style={{ textAlign: "right" }}>
                  {selectedContract && (rateDrafts[item.id]?.[selectedContract.id] ?? item.contractRates[selectedContract.id] ?? "") !== (item.contractRates[selectedContract.id] ?? "")
                    ? "Edited"
                    : "Saved"}
                </div>
              </div>
            ))}
            {visibleQuoteItems.length === 0 ? <div className="muted" style={{ paddingTop: 12 }}>No rate items match this search.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RatesPage() {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [quoteItems, setQuoteItems] = useState<QuoteCatalogItemRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ contracts: ContractRecord[]; items: QuoteCatalogItemRecord[] }>("jobs/quotation/options")
      .then((result) => {
        setContracts(result.contracts);
        setQuoteItems(result.items);
        setError(null);
      })
      .catch((caughtError) => {
        setError(caughtError instanceof Error ? caughtError.message : "Failed to load rates.");
      });
  }, []);

  return (
    <ProtectedWorkspace
      allow="tenant"
      description="Manage editable customer rate lists and the items your team can pull straight into job quotations."
      title="Rates"
    >
      {(session) => canManageWorkspace(session.user.role) ? (
        <div className="stack">
          <ErrorText error={error} />
          <QuotationLibraryPanel
            contracts={contracts}
            quoteItems={quoteItems}
            setContracts={setContracts}
            setQuoteItems={setQuoteItems}
          />
        </div>
      ) : (
        <div className="panel" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700 }}>Rates are manager-only.</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Managers can maintain customer rate lists here and then select them in each job quotation.
          </div>
        </div>
      )}
    </ProtectedWorkspace>
  );
}

export function AssetsPage() {
  return (
    <AssetManagementWorkspace
      description="Track tools, plant, and field equipment with service dates and operational status."
      emptyMessage="No tools or field assets have been added yet."
      excludeKind="VEHICLE"
      itemLabel="tool"
      title="Assets"
    />
  );
}

export function VehiclesPage() {
  return (
    <AssetManagementWorkspace
      description="Manage company vehicles, service dates, and fleet readiness for job allocation."
      itemLabel="vehicle"
      kind="VEHICLE"
      emptyMessage="No vehicles have been added yet."
      title="Vehicles"
    />
  );
}

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

export function SettingsPage() {
  const [theme, setTheme] = useState<ThemePreference>("dark");
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const currentTheme = readThemePreference();
    setTheme(currentTheme);
    applyThemePreference(currentTheme);
  }, []);

  function handleSaveTheme() {
    persistThemePreference(theme);
    setSaved(`Theme updated to ${theme === "light" ? "Light Mode" : "Dark Mode"}.`);
  }

  return (
    <ProtectedWorkspace allow="tenant" description="Choose how the workspace looks for your account on this device." title="Settings">
      {() => (
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 24 }}>
          <div className="panel" style={{ padding: 24 }}>
            <div style={{ fontWeight: 800, marginBottom: 16 }}>Appearance</div>
            <div className="stack">
              <label className="field">
                <span>Theme</span>
                <select className="input" onChange={(event) => setTheme(event.target.value as ThemePreference)} value={theme}>
                  <option value="dark">Dark Mode</option>
                  <option value="light">Light Mode</option>
                </select>
              </label>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button className="button" onClick={handleSaveTheme} type="button">Save Settings</button>
              </div>
              {saved ? <div className="callout">{saved}</div> : null}
            </div>
          </div>
          <div className="panel" style={{ padding: 24 }}>
            <div style={{ fontWeight: 800, marginBottom: 16 }}>Theme notes</div>
            <div className="stack" style={{ gap: 12 }}>
              <div className="callout">Dark Mode remains the default so the current look stays as-is for existing users.</div>
              <div className="callout">Light Mode is saved on this device, so each person can choose their preferred view.</div>
            </div>
          </div>
        </div>
      )}
    </ProtectedWorkspace>
  );
}
