import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { PlatformPrismaService } from "../../database/platform-prisma.service";
import { ProvisioningService } from "../../database/provisioning.service";
import { TenantPrismaFactory } from "../../database/tenant-prisma.factory";
import { CreateTenantDto } from "./tenants.dto";

@Injectable()
export class TenantsService {
  constructor(
    private readonly platformPrisma: PlatformPrismaService,
    private readonly provisioning: ProvisioningService,
    private readonly tenantFactory: TenantPrismaFactory
  ) {}

  async createTenant(dto: CreateTenantDto) {
    const company = await this.platformPrisma.company.create({
      data: {
        name: dto.companyName,
        slug: dto.slug,
        subscription: {
          create: {
            planCode: dto.planCode,
            status: "ACTIVE",
            seatsIncluded: 25
          }
        }
      }
    });

    try {
      const tenantUrl = await this.provisioning.provisionTenantDatabase({
        companyId: company.id,
        slug: dto.slug,
        databaseName: dto.databaseName,
        databaseUser: dto.databaseUser,
        databasePassword: dto.databasePassword
      });

      await this.tenantFactory.resetClient(tenantUrl);
      const tenantPrisma = this.tenantFactory.getClient(tenantUrl);
      await tenantPrisma.user.create({
        data: {
          id: randomUUID(),
          email: dto.ownerEmail,
          fullName: `${dto.companyName} Owner`,
          role: "DIRECTOR",
          passwordHash: await argon2.hash(dto.ownerPassword)
        }
      });

      return this.platformPrisma.company.findUniqueOrThrow({
        where: { id: company.id },
        include: { subscription: true, tenantDatabase: true }
      });
    } catch (error) {
      await this.platformPrisma.company.delete({
        where: { id: company.id }
      }).catch(() => undefined);

      throw error;
    }
  }
}
