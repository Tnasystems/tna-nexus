import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";
import { CreateTaskDto } from "./tasks.dto";

@Injectable()
export class TasksService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async list(user: JwtUser) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.task.findMany({ orderBy: { createdAt: "desc" } });
  }

  async create(user: JwtUser, dto: CreateTaskDto) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.task.create({
      data: {
        id: randomUUID(),
        jobId: dto.jobId,
        title: dto.title,
        status: dto.status
      }
    });
  }
}
