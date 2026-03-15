import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";

@Injectable()
export class TimesheetsService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async list(user: JwtUser) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.timesheetEntry.findMany({ orderBy: { startedAt: "desc" } });
  }

  async clock(user: JwtUser, action: "CLOCK_IN" | "CLOCK_OUT") {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    if (action === "CLOCK_IN") {
      return prisma.timesheetEntry.create({
        data: {
          id: randomUUID(),
          userId: user.sub,
          startedAt: new Date()
        }
      });
    }

    const latest = await prisma.timesheetEntry.findFirst({
      where: { userId: user.sub, endedAt: null },
      orderBy: { startedAt: "desc" }
    });

    if (!latest) {
      throw new NotFoundException("No active timesheet entry found.");
    }

    return prisma.timesheetEntry.update({
      where: { id: latest.id },
      data: { endedAt: new Date() }
    });
  }
}
