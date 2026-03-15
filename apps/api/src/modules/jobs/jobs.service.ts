import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";
import { CreateJobDto } from "./jobs.dto";

@Injectable()
export class JobsService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async list(user: JwtUser) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.job.findMany({ include: { tasks: true }, orderBy: { createdAt: "desc" } });
  }

  async create(user: JwtUser, dto: CreateJobDto) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.job.create({
      data: {
        id: randomUUID(),
        title: dto.title,
        companyJobNumber: dto.companyJobNumber,
        customerJobNumber: dto.customerJobNumber,
        siteAddress: dto.siteAddress,
        status: dto.status,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
        assignedOperativeIds: dto.assignedOperativeIds ?? []
      }
    });
  }
}
