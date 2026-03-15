import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  PLATFORM_DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  TENANT_CREDENTIAL_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("30d"),
  UPLOAD_ROOT: z.string().default("./uploads"),
  DEFAULT_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_SUPERUSER: z.string().min(1),
  POSTGRES_SUPERUSER_PASSWORD: z.string().min(1),
  PLATFORM_ADMIN_EMAIL: z.string().email(),
  PLATFORM_ADMIN_PASSWORD: z.string().min(10),
  DEMO_COMPANY_SLUG: z.string().min(3),
  DEMO_COMPANY_NAME: z.string().min(3),
  DEMO_COMPANY_DB_NAME: z.string().min(3),
  DEMO_COMPANY_DB_USER: z.string().min(3),
  DEMO_COMPANY_DB_PASSWORD: z.string().min(8)
});

export type Env = z.infer<typeof envSchema>;
