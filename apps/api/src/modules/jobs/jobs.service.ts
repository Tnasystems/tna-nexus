import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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
    const scheduledDays = this.normalizeScheduledDays(dto.scheduledDays, dto.scheduledFor, dto.scheduledTo);
    await this.ensureNoAssignmentClashes(prisma, dto.assignedOperativeIds ?? [], scheduledDays);
    return prisma.job.create({
      data: {
        id: randomUUID(),
        title: dto.title,
        companyJobNumber: dto.companyJobNumber,
        customerJobNumber: dto.customerJobNumber,
        siteAddress: dto.siteAddress,
        status: dto.status,
        scheduledFor: this.toDateBoundary(dto.scheduledFor, scheduledDays[0], "start"),
        scheduledTo: this.toDateBoundary(dto.scheduledTo, scheduledDays[scheduledDays.length - 1], "end"),
        scheduledDays,
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

    const scheduledDays = dto.scheduledDays === undefined && dto.scheduledFor === undefined && dto.scheduledTo === undefined
      ? existing.scheduledDays
      : this.normalizeScheduledDays(dto.scheduledDays, dto.scheduledFor, dto.scheduledTo);
    const assignedOperativeIds = dto.assignedOperativeIds ?? existing.assignedOperativeIds;

    await this.ensureNoAssignmentClashes(prisma, assignedOperativeIds, scheduledDays, jobId);

    return prisma.job.update({
      where: { id: jobId },
      data: {
        title: dto.title ?? undefined,
        companyJobNumber: dto.companyJobNumber ?? undefined,
        customerJobNumber: dto.customerJobNumber ?? undefined,
        siteAddress: dto.siteAddress ?? undefined,
        status: dto.status ?? undefined,
        scheduledFor: dto.scheduledDays === undefined && dto.scheduledFor === undefined
          ? undefined
          : this.toDateBoundary(dto.scheduledFor, scheduledDays[0], "start"),
        scheduledTo: dto.scheduledDays === undefined && dto.scheduledTo === undefined
          ? undefined
          : this.toDateBoundary(dto.scheduledTo, scheduledDays[scheduledDays.length - 1], "end"),
        scheduledDays: dto.scheduledDays === undefined && dto.scheduledFor === undefined && dto.scheduledTo === undefined
          ? undefined
          : scheduledDays,
        assignedOperativeIds: dto.assignedOperativeIds ?? undefined
      }
    });
  }

  private normalizeScheduledDays(scheduledDays?: string[], scheduledFor?: string, scheduledTo?: string) {
    const directDays = (scheduledDays ?? [])
      .map((day) => day.trim())
      .filter(Boolean);

    if (directDays.length > 0) {
      return [...new Set(directDays)].sort();
    }

    if (!scheduledFor) {
      return [];
    }

    const start = new Date(scheduledFor);
    const end = scheduledTo ? new Date(scheduledTo) : new Date(scheduledFor);
    const normalizedStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const normalizedEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    if (normalizedEnd < normalizedStart) {
      throw new BadRequestException("End date cannot be before start date.");
    }

    const days: string[] = [];
    const cursor = new Date(normalizedStart);

    while (cursor <= normalizedEnd) {
      days.push(this.toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return days;
  }

  private toDateBoundary(explicitDate: string | undefined, fallbackDay: string | undefined, mode: "start" | "end") {
    if (explicitDate) {
      return new Date(explicitDate);
    }

    if (!fallbackDay) {
      return null;
    }

    return new Date(`${fallbackDay}T${mode === "start" ? "00:00:00" : "23:59:59"}`);
  }

  private toDateKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private deriveExistingScheduledDays(job: {
    scheduledDays: string[];
    scheduledFor: Date | null;
    scheduledTo: Date | null;
  }) {
    if ((job.scheduledDays ?? []).length > 0) {
      return job.scheduledDays;
    }

    if (!job.scheduledFor) {
      return [];
    }

    return this.normalizeScheduledDays(undefined, job.scheduledFor.toISOString(), job.scheduledTo?.toISOString());
  }

  private async ensureNoAssignmentClashes(
    prisma: Awaited<ReturnType<TenantAccessService["getTenantContext"]>>["prisma"],
    assignedOperativeIds: string[],
    scheduledDays: string[],
    excludeJobId?: string
  ) {
    if (assignedOperativeIds.length === 0 || scheduledDays.length === 0) {
      return;
    }

    const possibleConflicts = await prisma.job.findMany({
      where: {
        ...(excludeJobId ? { id: { not: excludeJobId } } : {}),
        OR: assignedOperativeIds.map((operativeId) => ({
          assignedOperativeIds: { has: operativeId }
        }))
      }
    });

    for (const conflict of possibleConflicts) {
      const conflictDays = this.deriveExistingScheduledDays(conflict);
      const overlappingDays = scheduledDays.filter((day) => conflictDays.includes(day));
      if (overlappingDays.length > 0) {
        throw new BadRequestException(
          `Assigned operatives already have another job on ${overlappingDays.join(", ")}.`
        );
      }
    }
  }
}
