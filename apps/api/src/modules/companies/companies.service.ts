import { Injectable } from "@nestjs/common";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";

@Injectable()
export class CompaniesService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async profile(user: JwtUser) {
    const { company, prisma } = await this.tenantAccess.getTenantContext(user);
    const [users, jobs, assets] = await prisma.$transaction([
      prisma.user.count(),
      prisma.job.count(),
      prisma.asset.count()
    ]);

    return {
      company,
      metrics: { users, jobs, assets }
    };
  }
}
