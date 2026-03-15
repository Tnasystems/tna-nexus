import { Injectable } from "@nestjs/common";
import { PlatformPrismaService } from "../../database/platform-prisma.service";

@Injectable()
export class PlatformAdminService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  dashboard() {
    return this.prisma.$transaction([
      this.prisma.company.count(),
      this.prisma.subscription.count(),
      this.prisma.demoAccount.count(),
      this.prisma.systemAuditLog.count()
    ]).then(([companies, subscriptions, demoAccounts, auditLogs]) => ({
      companies,
      subscriptions,
      demoAccounts,
      auditLogs
    }));
  }

  listCompanies() {
    return this.prisma.company.findMany({
      include: {
        subscription: true,
        tenantDatabase: true
      },
      orderBy: { createdAt: "desc" }
    });
  }
}
