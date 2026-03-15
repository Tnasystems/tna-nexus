import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import { PlatformPrismaService } from "./platform-prisma.service";
import { SecretCipherService } from "./secret-cipher.service";

const execFileAsync = promisify(execFile);

interface ProvisionTenantInput {
  companyId: string;
  slug: string;
  databaseName: string;
  databaseUser: string;
  databasePassword: string;
}

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly platformPrisma: PlatformPrismaService,
    private readonly secretCipher: SecretCipherService
  ) {}

  async provisionTenantDatabase(input: ProvisionTenantInput) {
    const client = new Client({
      host: this.config.getOrThrow("POSTGRES_HOST"),
      port: this.config.getOrThrow<number>("POSTGRES_PORT"),
      user: this.config.getOrThrow("POSTGRES_SUPERUSER"),
      password: this.config.getOrThrow("POSTGRES_SUPERUSER_PASSWORD"),
      database: "postgres"
    });

    await client.connect();

    try {
      if (await this.databaseExists(client, input.databaseName)) {
        throw new ConflictException(`Database ${input.databaseName} already exists.`);
      }

      if (await this.roleExists(client, input.databaseUser)) {
        throw new ConflictException(`Database user ${input.databaseUser} already exists.`);
      }

      await client.query(`CREATE ROLE "${input.databaseUser}" LOGIN PASSWORD '${this.escapeLiteral(input.databasePassword)}'`);
      await client.query(`CREATE DATABASE "${input.databaseName}" OWNER "${input.databaseUser}"`);

      const tenantUrl = this.toTenantUrl(input);

      await execFileAsync(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        ["--filter", "@tna-nexus/api", "prisma:migrate:tenant"],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: tenantUrl }
        }
      );

      await this.platformPrisma.tenantDatabase.create({
        data: {
          companyId: input.companyId,
          slug: input.slug,
          databaseName: input.databaseName,
          databaseUser: input.databaseUser,
          databasePasswordEncrypted: this.secretCipher.encrypt(input.databasePassword),
          host: this.config.getOrThrow("POSTGRES_HOST"),
          port: Number(this.config.getOrThrow("POSTGRES_PORT")),
          ssl: false
        }
      });

      this.logger.log(`Provisioned dedicated tenant database for ${input.slug}`);
      return tenantUrl;
    } catch (error) {
      await this.cleanupFailedProvision(client, input.databaseName, input.databaseUser);
      throw error;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  toTenantUrl(input: { databaseName: string; databaseUser: string; databasePassword: string }) {
    const host = this.config.getOrThrow("POSTGRES_HOST");
    const port = Number(this.config.getOrThrow("POSTGRES_PORT"));
    return `postgresql://${input.databaseUser}:${encodeURIComponent(input.databasePassword)}@${host}:${port}/${input.databaseName}?schema=public`;
  }

  private escapeLiteral(value: string) {
    return value.replace(/'/g, "''");
  }

  private async databaseExists(client: Client, databaseName: string) {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
    return (result.rowCount ?? 0) > 0;
  }

  private async roleExists(client: Client, roleName: string) {
    const result = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [roleName]);
    return (result.rowCount ?? 0) > 0;
  }

  private async cleanupFailedProvision(client: Client, databaseName: string, databaseUser: string) {
    await client.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName}' AND pid <> pg_backend_pid()`).catch(() => undefined);
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`).catch(() => undefined);
    await client.query(`DROP ROLE IF EXISTS "${databaseUser}"`).catch(() => undefined);
  }
}
