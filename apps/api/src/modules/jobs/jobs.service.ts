import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";
import { CreateJobDto, UpdateJobDto } from "./jobs.dto";

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

  async update(user: JwtUser, jobId: string, dto: UpdateJobDto) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const existing = await prisma.job.findUnique({ where: { id: jobId } });

    if (!existing) {
      throw new NotFoundException("Job not found.");
    }

    return prisma.job.update({
      where: { id: jobId },
      data: {
        title: dto.title ?? undefined,
        companyJobNumber: dto.companyJobNumber ?? undefined,
        customerJobNumber: dto.customerJobNumber ?? undefined,
        siteAddress: dto.siteAddress ?? undefined,
        status: dto.status ?? undefined,
        scheduledFor: dto.scheduledFor === undefined ? undefined : dto.scheduledFor ? new Date(dto.scheduledFor) : null,
        assignedOperativeIds: dto.assignedOperativeIds ?? undefined
      }
    });
  }
}
