import { ForbiddenException, Injectable } from "@nestjs/common";
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

  create(user: JwtUser, body: { name: string; serialNumber: string; kind?: string; registrationNumber?: string }) {
    this.ensureManager(user);
    return this.tenantAccess.getTenantContext(user).then(({ prisma }) =>
      prisma.asset.create({
        data: {
          id: randomUUID(),
          name: body.name,
          serialNumber: body.serialNumber,
          kind: body.kind ?? "GENERAL",
          registrationNumber: body.registrationNumber ?? null
        }
      })
    );
  }

  private ensureManager(user: JwtUser) {
    if (user.role !== "PLATFORM_ADMIN" && user.role !== "DIRECTOR" && user.role !== "MANAGER") {
      throw new ForbiddenException("You do not have permission to manage assets.");
    }
  }
}
