export const API_VERSION = "v1";

export const ROLE_VALUES = [
  "PLATFORM_ADMIN",
  "COMPANY_OWNER",
  "COMPANY_ADMIN",
  "DISPATCHER",
  "SUPERVISOR",
  "FIELD_TECH",
  "AUDITOR",
  "VIEWER"
] as const;

export const JOB_STATUS_VALUES = [
  "DRAFT",
  "SCHEDULED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED"
] as const;

export const TASK_STATUS_VALUES = [
  "PENDING",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE"
] as const;
