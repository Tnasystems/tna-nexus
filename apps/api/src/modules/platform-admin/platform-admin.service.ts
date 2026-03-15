import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "pg";
import { PlatformPrismaService } from "../../database/platform-prisma.service";
import { SecretCipherService } from "../../database/secret-cipher.service";

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly config: ConfigService,
    private readonly secretCipher: SecretCipherService
  ) {}

  dashboard() {
    return this.prisma.$transaction([
      this.prisma.company.count(),
      this.prisma.subscription.count(),
      this.prisma.demoAccount.count(),
      this.prisma.systemAuditLog.count()
    ]).then(([companies, subscriptions, demoAccounts, auditLogs]) => ({
      companies,
      subscriptions,
      demoAccounts,
      auditLogs
    }));
  }

  listCompanies() {
    return this.prisma.company.findMany({
      include: {
        subscription: true,
        tenantDatabase: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async setCompanyStatus(companyId: string, status: "ACTIVE" | "SUSPENDED") {
    return this.prisma.company.update({
      where: { id: companyId },
      data: { status }
    });
  }

  async deleteCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { tenantDatabase: true }
    });

    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    if (company.tenantDatabase) {
      await this.dropTenantDatabase(company.tenantDatabase.databaseName, company.tenantDatabase.databaseUser);
    }

    await this.prisma.company.delete({
      where: { id: companyId }
    });

    return { success: true };
  }

  private async dropTenantDatabase(databaseName: string, databaseUser: string) {
    const client = new Client({
      host: this.config.getOrThrow("POSTGRES_HOST"),
      port: Number(this.config.getOrThrow("POSTGRES_PORT")),
      user: this.config.getOrThrow("POSTGRES_SUPERUSER"),
      password: this.config.getOrThrow("POSTGRES_SUPERUSER_PASSWORD"),
      database: "postgres"
    });

    await client.connect();
    await client.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName}' AND pid <> pg_backend_pid()`);
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await client.query(`DROP ROLE IF EXISTS "${databaseUser}"`);
    await client.end();
  }
}
