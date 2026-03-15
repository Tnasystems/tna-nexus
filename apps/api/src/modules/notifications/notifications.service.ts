import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";

@Injectable()
export class NotificationsService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  list(user: JwtUser) {
    return this.tenantAccess.getTenantContext(user).then(({ prisma }) =>
      prisma.notification.findMany({ orderBy: { createdAt: "desc" } })
    );
  }

  create(user: JwtUser, body: { title: string; body: string }) {
    return this.tenantAccess.getTenantContext(user).then(({ prisma }) =>
      prisma.notification.create({
        data: {
          id: randomUUID(),
          title: body.title,
          body: body.body,
          channel: "IN_APP",
          status: "QUEUED"
        }
      })
    );
  }
}
