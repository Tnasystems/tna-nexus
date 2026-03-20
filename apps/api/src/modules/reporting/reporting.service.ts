import { Injectable } from "@nestjs/common";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";

@Injectable()
export class ReportingService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async summary(user: JwtUser) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);

    if (this.isManager(user)) {
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

    const visibleJobs = await prisma.job.findMany({
      where: { assignedOperativeIds: { has: user.sub } },
      select: { status: true, assignedOperativeIds: true }
    });
    const visibleUserIds = new Set([user.sub, ...visibleJobs.flatMap((job) => job.assignedOperativeIds)]);

    return {
      jobs: visibleJobs.length,
      completedJobs: visibleJobs.filter((job) => job.status === "COMPLETED").length,
      scheduledJobs: visibleJobs.filter((job) => job.status === "SCHEDULED").length,
      activeUsers: visibleUserIds.size
    };
  }

  private isManager(user: JwtUser) {
    return user.role === "PLATFORM_ADMIN" || user.role === "DIRECTOR" || user.role === "MANAGER";
  }
}
