import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { FormSchemaDefinition, JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";

@Injectable()
export class FormsService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async list(user: JwtUser) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.formDefinition.findMany({ orderBy: { createdAt: "desc" } });
  }

  async create(user: JwtUser, schema: FormSchemaDefinition) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.formDefinition.create({
      data: {
        id: randomUUID(),
        name: schema.name,
        version: schema.version,
        schemaJson: JSON.stringify(schema)
      }
    });
  }
}
