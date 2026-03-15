import { Injectable } from "@nestjs/common";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";

@Injectable()
export class SearchService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async query(user: JwtUser, term: string) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const contains = { contains: term, mode: "insensitive" as const };
    const [jobs, users, assets] = await prisma.$transaction([
      prisma.job.findMany({ where: { title: contains }, take: 5 }),
      prisma.user.findMany({ where: { fullName: contains }, take: 5 }),
      prisma.asset.findMany({ where: { name: contains }, take: 5 })
    ]);

    return { jobs, users, assets };
  }
}
