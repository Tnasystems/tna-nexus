import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";

@Injectable()
export class AssetsService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  list(user: JwtUser) {
    return this.tenantAccess.getTenantContext(user).then(({ prisma }) =>
      prisma.asset.findMany({ orderBy: { createdAt: "desc" } })
    );
  }

  create(user: JwtUser, body: { name: string; serialNumber: string }) {
    return this.tenantAccess.getTenantContext(user).then(({ prisma }) =>
      prisma.asset.create({
        data: {
          id: randomUUID(),
          name: body.name,
          serialNumber: body.serialNumber
        }
      })
    );
  }
}
