import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";
import { CreateJobDto, UpdateJobDto } from "./jobs.dto";

@Injectable()
export class JobsService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async list(user: JwtUser) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.job.findMany({
      where: this.isManager(user) ? undefined : { assignedOperativeIds: { has: user.sub } },
      include: { tasks: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async get(user: JwtUser, jobId: string) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { tasks: true }
    });

    if (!job) {
      throw new NotFoundException("Job not found.");
    }

    if (!this.isManager(user) && !job.assignedOperativeIds.includes(user.sub)) {
      throw new ForbiddenException("You do not have access to this job.");
    }

    return job;
  }

  async create(user: JwtUser, dto: CreateJobDto) {
    this.ensureManager(user);
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const { scheduledDays, dailyAssignments, assignedOperativeIds } = this.buildScheduling(dto);
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
        scheduledStartTime: dto.scheduledStartTime ?? null,
        scheduledEndTime: dto.scheduledEndTime ?? null,
        scheduledDays,
        dailyAssignmentsJson: JSON.stringify(dailyAssignments),
        assignedOperativeIds
      }
    });
  }

  async update(user: JwtUser, jobId: string, dto: UpdateJobDto) {
    this.ensureManager(user);
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const existing = await prisma.job.findUnique({ where: { id: jobId } });

    if (!existing) {
      throw new NotFoundException("Job not found.");
    }

    const scheduling = this.buildScheduling(dto, existing);

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
          : this.toDateBoundary(dto.scheduledFor, scheduling.scheduledDays[0], "start"),
        scheduledTo: dto.scheduledDays === undefined && dto.scheduledTo === undefined
          ? undefined
          : this.toDateBoundary(dto.scheduledTo, scheduling.scheduledDays[scheduling.scheduledDays.length - 1], "end"),
        scheduledDays: dto.scheduledDays === undefined && dto.scheduledFor === undefined && dto.scheduledTo === undefined
          ? undefined
          : scheduling.scheduledDays,
        scheduledStartTime: dto.scheduledStartTime ?? undefined,
        scheduledEndTime: dto.scheduledEndTime ?? undefined,
        dailyAssignmentsJson: dto.dailyAssignments === undefined && dto.scheduledDays === undefined && dto.scheduledFor === undefined && dto.scheduledTo === undefined
          ? undefined
          : JSON.stringify(scheduling.dailyAssignments),
        assignedOperativeIds: scheduling.assignedOperativeIds
      }
    });
  }

  private buildScheduling(
    dto: Pick<CreateJobDto, "scheduledDays" | "scheduledFor" | "scheduledTo" | "assignedOperativeIds" | "dailyAssignments">,
    existing?: {
      scheduledDays: string[];
      scheduledFor: Date | null;
      scheduledTo: Date | null;
      dailyAssignmentsJson: string;
      assignedOperativeIds: string[];
    }
  ) {
    const baseScheduledDays = dto.scheduledDays === undefined && dto.scheduledFor === undefined && dto.scheduledTo === undefined
      ? this.deriveExistingScheduledDays(existing)
      : this.normalizeScheduledDays(dto.scheduledDays, dto.scheduledFor, dto.scheduledTo);
    const existingAssignments = this.parseDailyAssignments(existing?.dailyAssignmentsJson);
    const rawAssignments = dto.dailyAssignments === undefined
      ? this.withFallbackAssignments(existingAssignments, baseScheduledDays, existing?.assignedOperativeIds ?? dto.assignedOperativeIds ?? [])
      : this.withFallbackAssignments(this.normalizeDailyAssignments(dto.dailyAssignments), baseScheduledDays, dto.assignedOperativeIds ?? []);
    const scheduledDays = [...new Set([
      ...baseScheduledDays,
      ...Object.keys(rawAssignments)
    ])].sort();
    const dailyAssignments = Object.fromEntries(
      scheduledDays.map((day) => [day, [...new Set(rawAssignments[day] ?? [])]])
    );
    const assignedOperativeIds = [...new Set(
      Object.values(dailyAssignments).flat()
    )];

    return { scheduledDays, dailyAssignments, assignedOperativeIds };
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

  private deriveExistingScheduledDays(job?: {
    scheduledDays: string[];
    scheduledFor: Date | null;
    scheduledTo: Date | null;
  }) {
    if (!job) {
      return [];
    }

    if ((job.scheduledDays ?? []).length > 0) {
      return job.scheduledDays;
    }

    if (!job.scheduledFor) {
      return [];
    }

    return this.normalizeScheduledDays(undefined, job.scheduledFor.toISOString(), job.scheduledTo?.toISOString());
  }

  private parseDailyAssignments(value?: string) {
    if (!value) {
      return {} as Record<string, string[]>;
    }

    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return this.normalizeDailyAssignments(parsed);
    } catch {
      return {} as Record<string, string[]>;
    }
  }

  private normalizeDailyAssignments(value?: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(value ?? {})
        .filter(([day]) => Boolean(day))
        .map(([day, users]) => [
          day,
          Array.isArray(users)
            ? [...new Set(users.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0))]
            : []
        ])
    ) as Record<string, string[]>;
  }

  private withFallbackAssignments(
    assignments: Record<string, string[]>,
    scheduledDays: string[],
    fallbackUsers: string[]
  ) {
    if (Object.keys(assignments).length > 0) {
      return assignments;
    }

    return Object.fromEntries(scheduledDays.map((day) => [day, fallbackUsers])) as Record<string, string[]>;
  }

  private isManager(user: JwtUser) {
    return user.role === "PLATFORM_ADMIN" || user.role === "DIRECTOR" || user.role === "MANAGER";
  }

  private ensureManager(user: JwtUser) {
    if (!this.isManager(user)) {
      throw new ForbiddenException("You do not have permission to modify jobs.");
    }
  }

}
