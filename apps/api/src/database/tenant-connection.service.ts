import { Injectable, NotFoundException } from "@nestjs/common";
import { PlatformPrismaService } from "./platform-prisma.service";
import type { TenantConnectionMetadata } from "@tna-nexus/shared";

@Injectable()
export class TenantConnectionService {
  constructor(private readonly platformPrisma: PlatformPrismaService) {}

  async getByCompanyId(companyId: string): Promise<TenantConnectionMetadata> {
    const connection = await this.platformPrisma.tenantDatabase.findUnique({
      where: { companyId }
    });

    if (!connection) {
      throw new NotFoundException("Tenant database connection was not found.");
    }

    return {
      companyId,
      slug: connection.slug,
      databaseName: connection.databaseName,
      databaseUser: connection.databaseUser,
      databasePasswordEncrypted: connection.databasePasswordEncrypted,
      host: connection.host,
      port: connection.port,
      ssl: connection.ssl
    };
  }

  async getBySlug(slug: string): Promise<TenantConnectionMetadata> {
    const connection = await this.platformPrisma.tenantDatabase.findUnique({
      where: { slug }
    });

    if (!connection) {
      throw new NotFoundException("Tenant database connection was not found.");
    }

    return {
      companyId: connection.companyId,
      slug: connection.slug,
      databaseName: connection.databaseName,
      databaseUser: connection.databaseUser,
      databasePasswordEncrypted: connection.databasePasswordEncrypted,
      host: connection.host,
      port: connection.port,
      ssl: connection.ssl
    };
  }
}
