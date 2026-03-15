import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";

@Injectable()
export class ComplianceService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  list(user: JwtUser) {
    return this.tenantAccess.getTenantContext(user).then(({ prisma }) =>
      prisma.complianceRecord.findMany({ orderBy: { dueDate: "asc" } })
    );
  }

  create(user: JwtUser, body: { title: string; dueDate: string }) {
    return this.tenantAccess.getTenantContext(user).then(({ prisma }) =>
      prisma.complianceRecord.create({
        data: {
          id: randomUUID(),
          title: body.title,
          dueDate: new Date(body.dueDate),
          status: "OPEN"
        }
      })
    );
  }
}
