import { Injectable } from "@nestjs/common";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";

@Injectable()
export class ReportingService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async summary(user: JwtUser) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const [jobs, completedJobs, scheduledJobs, activeUsers] = await prisma.$transaction([
      prisma.job.count(),
      prisma.job.count({ where: { status: "COMPLETED" } }),
      prisma.job.count({ where: { status: "SCHEDULED" } }),
      prisma.user.count()
    ]);

    return {
      jobs,
      completedJobs,
      scheduledJobs,
      activeUsers
    };
  }
}
