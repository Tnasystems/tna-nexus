import { ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { JwtUser } from "@tna-nexus/shared";
import { PlatformPrismaService } from "../database/platform-prisma.service";
import { SecretCipherService } from "../database/secret-cipher.service";
import { TenantConnectionService } from "../database/tenant-connection.service";
import { TenantPrismaFactory } from "../database/tenant-prisma.factory";

@Injectable()
export class TenantAccessService {
  constructor(
    private readonly config: ConfigService,
    private readonly platformPrisma: PlatformPrismaService,
    private readonly secretCipher: SecretCipherService,
    private readonly connectionService: TenantConnectionService,
    private readonly tenantFactory: TenantPrismaFactory
  ) {}

  async getTenantContext(user: JwtUser) {
    if (!user.companyId || !user.tenantSlug) {
      throw new ForbiddenException("Tenant context is required.");
    }

    const metadata = await this.connectionService.getByCompanyId(user.companyId);
    if (metadata.slug !== user.tenantSlug) {
      throw new ForbiddenException("Tenant mismatch detected.");
    }

    const company = await this.platformPrisma.company.findUniqueOrThrow({
      where: { id: user.companyId }
    });

    if (company.status === "SUSPENDED") {
      throw new ForbiddenException("This company is suspended.");
    }

    const prisma = this.tenantFactory.getClient(
      this.toDatabaseUrl(
        metadata.databaseName,
        metadata.databaseUser,
        this.secretCipher.decrypt(metadata.databasePasswordEncrypted ?? "")
      )
    );
    if (user.role !== "PLATFORM_ADMIN") {
      const currentUser = await prisma.user.findUnique({ where: { id: user.sub } });

      if (!currentUser || currentUser.accountStatus !== "ACTIVE") {
        throw new ForbiddenException("This user account is disabled.");
      }
    }

    return {
      company,
      prisma
    };
  }

  async getTenantContextBySlug(slug: string) {
    const metadata = await this.connectionService.getBySlug(slug);
    const company = await this.platformPrisma.company.findUniqueOrThrow({
      where: { id: metadata.companyId }
    });

    if (company.status === "SUSPENDED") {
      throw new ForbiddenException("This company is suspended.");
    }

    return {
      company,
      prisma: this.tenantFactory.getClient(
        this.toDatabaseUrl(
          metadata.databaseName,
          metadata.databaseUser,
          this.secretCipher.decrypt(metadata.databasePasswordEncrypted ?? "")
        )
      )
    };
  }

  private toDatabaseUrl(databaseName: string, databaseUser: string, databasePassword: string) {
    return `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@${this.config.getOrThrow("POSTGRES_HOST")}:${this.config.getOrThrow<number>("POSTGRES_PORT")}/${databaseName}?schema=public`;
  }
}
