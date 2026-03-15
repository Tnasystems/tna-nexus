import { JOB_STATUS_VALUES, ROLE_VALUES, TASK_STATUS_VALUES } from "./constants";

export type Role = (typeof ROLE_VALUES)[number];
export type JobStatus = (typeof JOB_STATUS_VALUES)[number];
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

export interface JwtUser {
  sub: string;
  email: string;
  role: Role;
  companyId?: string;
  tenantSlug?: string;
  sessionId: string;
}

export interface TenantConnectionMetadata {
  companyId: string;
  slug: string;
  databaseName: string;
  databaseUser: string;
  databasePasswordEncrypted?: string;
  host: string;
  port: number;
  ssl: boolean;
}

export interface FormSchemaDefinition {
  id: string;
  name: string;
  version: number;
  sections: Array<{
    id: string;
    title: string;
    fields: Array<{
      id: string;
      type: "text" | "textarea" | "number" | "select" | "checkbox" | "date" | "photo" | "signature";
      label: string;
      required?: boolean;
      options?: string[];
    }>;
  }>;
}
