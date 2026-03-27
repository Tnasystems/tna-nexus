import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";
import { CreateJobDto, UpdateJobDto } from "./jobs.dto";

@Injectable()
export class JobsService {
  constructor(
    private readonly tenantAccess: TenantAccessService,
    private readonly config: ConfigService
  ) {}

  async list(user: JwtUser) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const jobs = await prisma.job.findMany({
      where: this.isManager(user) ? undefined : { assignedOperativeIds: { has: user.sub } },
      include: { tasks: true },
      orderBy: { createdAt: "desc" }
    });
    return jobs.map((job) => this.sanitizeJobForUser(job, user));
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

    return this.sanitizeJobForUser(job, user);
  }

  async create(user: JwtUser, dto: CreateJobDto) {
    this.ensureManager(user);
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const { scheduledDays, dailyAssignments, assignedOperativeIds, assignedVehicleIds } = this.normalizeAssignmentsForStatus(
      dto.status,
      this.buildScheduling(dto)
    );
    return prisma.job.create({
      data: {
        id: randomUUID(),
        title: dto.title,
        companyJobNumber: dto.companyJobNumber,
        customerJobNumber: dto.customerJobNumber,
        siteAddress: dto.siteAddress,
        externalInfo: dto.externalInfo ?? "",
        internalInfo: dto.internalInfo ?? "",
        status: dto.status,
        scheduledFor: this.toDateBoundary(dto.scheduledFor, scheduledDays[0], "start"),
        scheduledTo: this.toDateBoundary(dto.scheduledTo, scheduledDays[scheduledDays.length - 1], "end"),
        scheduledStartTime: dto.scheduledStartTime ?? null,
        scheduledEndTime: dto.scheduledEndTime ?? null,
        scheduledDays,
        dailyAssignmentsJson: JSON.stringify(dailyAssignments),
        assignedOperativeIds,
        assignedVehicleIds
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

    const scheduling = this.normalizeAssignmentsForStatus(
      dto.status ?? existing.status,
      this.buildScheduling(dto, existing)
    );

    return prisma.job.update({
      where: { id: jobId },
      data: {
        title: dto.title ?? undefined,
        companyJobNumber: dto.companyJobNumber ?? undefined,
        customerJobNumber: dto.customerJobNumber ?? undefined,
        siteAddress: dto.siteAddress ?? undefined,
        externalInfo: dto.externalInfo ?? undefined,
        internalInfo: dto.internalInfo ?? undefined,
        status: dto.status ?? undefined,
        scheduledFor: (dto.status === "CANCELLED")
          ? null
          : dto.scheduledDays === undefined && dto.scheduledFor === undefined
          ? undefined
          : this.toDateBoundary(dto.scheduledFor, scheduling.scheduledDays[0], "start"),
        scheduledTo: (dto.status === "CANCELLED")
          ? null
          : dto.scheduledDays === undefined && dto.scheduledTo === undefined
          ? undefined
          : this.toDateBoundary(dto.scheduledTo, scheduling.scheduledDays[scheduling.scheduledDays.length - 1], "end"),
        scheduledDays: (dto.status === "CANCELLED")
          ? []
          : dto.scheduledDays === undefined && dto.scheduledFor === undefined && dto.scheduledTo === undefined
          ? undefined
          : scheduling.scheduledDays,
        scheduledStartTime: dto.scheduledStartTime ?? undefined,
        scheduledEndTime: dto.scheduledEndTime ?? undefined,
        dailyAssignmentsJson: (dto.status === "ON_HOLD" || dto.status === "CANCELLED")
          ? JSON.stringify(scheduling.dailyAssignments)
          : dto.dailyAssignments === undefined && dto.scheduledDays === undefined && dto.scheduledFor === undefined && dto.scheduledTo === undefined
          ? undefined
          : JSON.stringify(scheduling.dailyAssignments),
        assignedOperativeIds: scheduling.assignedOperativeIds,
        assignedVehicleIds: scheduling.assignedVehicleIds
      }
    });
  }

  async listDocuments(user: JwtUser, jobId: string) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const job = await this.getAccessibleJob(prisma, user, jobId);
    void job;

    return prisma.document.findMany({
      where: {
        jobId,
        ...(this.isManager(user) ? undefined : { visibility: "EXTERNAL" })
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async uploadDocument(
    user: JwtUser,
    jobId: string,
    visibility: string,
    file: { fileName: string; mimeType: string; buffer: Buffer }
  ) {
    this.ensureManager(user);
    const normalizedVisibility = this.normalizeDocumentVisibility(visibility);
    const { company, prisma } = await this.tenantAccess.getTenantContext(user);
    await this.getAccessibleJob(prisma, user, jobId);

    const id = randomUUID();
    const safeName = this.sanitizeFileName(file.fileName, file.mimeType);
    const dir = join(
      process.cwd(),
      this.config.getOrThrow<string>("UPLOAD_ROOT"),
      company.slug,
      "jobs",
      jobId,
      normalizedVisibility.toLowerCase()
    );

    await mkdir(dir, { recursive: true });

    const filePath = join(dir, `${id}-${safeName}`);
    await writeFile(filePath, file.buffer);

    return prisma.document.create({
      data: {
        id,
        name: safeName,
        storagePath: filePath,
        mimeType: file.mimeType || "application/octet-stream",
        jobId,
        visibility: normalizedVisibility
      }
    });
  }

  async downloadDocument(user: JwtUser, jobId: string, documentId: string) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    await this.getAccessibleJob(prisma, user, jobId);
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        jobId,
        ...(this.isManager(user) ? undefined : { visibility: "EXTERNAL" })
      }
    });

    if (!document) {
      throw new NotFoundException("Document not found.");
    }

    return {
      fileName: document.name,
      mimeType: document.mimeType,
      buffer: await readFile(document.storagePath)
    };
  }

  private buildScheduling(
    dto: Pick<CreateJobDto, "scheduledDays" | "scheduledFor" | "scheduledTo" | "assignedOperativeIds" | "assignedVehicleIds" | "dailyAssignments">,
    existing?: {
      scheduledDays: string[];
      scheduledFor: Date | null;
      scheduledTo: Date | null;
      dailyAssignmentsJson: string;
      assignedOperativeIds: string[];
      assignedVehicleIds: string[];
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
    const assignedVehicleIds = [...new Set(
      dto.assignedVehicleIds ?? existing?.assignedVehicleIds ?? []
    )];

    return { scheduledDays, dailyAssignments, assignedOperativeIds, assignedVehicleIds };
  }

  private normalizeAssignmentsForStatus(
    status: string,
    scheduling: { scheduledDays: string[]; dailyAssignments: Record<string, string[]>; assignedOperativeIds: string[]; assignedVehicleIds: string[] }
  ) {
    if (status === "ON_HOLD") {
      return {
        scheduledDays: scheduling.scheduledDays,
        dailyAssignments: Object.fromEntries(
          scheduling.scheduledDays.map((day) => [day, []])
        ) as Record<string, string[]>,
        assignedOperativeIds: [],
        assignedVehicleIds: []
      };
    }

    if (status === "CANCELLED") {
      return {
        scheduledDays: [],
        dailyAssignments: {},
        assignedOperativeIds: [],
        assignedVehicleIds: []
      };
    }

    if (status !== "ON_HOLD" && status !== "CANCELLED") {
      return scheduling;
    }

    return scheduling;
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

  private async getAccessibleJob(
    prisma: Awaited<ReturnType<TenantAccessService["getTenantContext"]>>["prisma"],
    user: JwtUser,
    jobId: string
  ) {
    const job = await prisma.job.findUnique({ where: { id: jobId } });

    if (!job) {
      throw new NotFoundException("Job not found.");
    }

    if (!this.isManager(user) && !job.assignedOperativeIds.includes(user.sub)) {
      throw new ForbiddenException("You do not have access to this job.");
    }

    return job;
  }

  private normalizeDocumentVisibility(value: string) {
    const normalized = value.toUpperCase();
    if (normalized !== "EXTERNAL" && normalized !== "INTERNAL") {
      throw new BadRequestException("Document visibility must be EXTERNAL or INTERNAL.");
    }

    return normalized;
  }

  private sanitizeFileName(fileName: string, mimeType?: string) {
    const cleaned = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (cleaned) {
      return cleaned;
    }

    return `file${this.extensionFromMimeType(mimeType)}`;
  }

  private extensionFromMimeType(mimeType?: string) {
    if (mimeType === "application/pdf") {
      return ".pdf";
    }

    if (mimeType?.startsWith("image/")) {
      const subtype = mimeType.split("/")[1];
      return subtype ? `.${subtype.replace(/[^a-zA-Z0-9]+/g, "")}` : ".img";
    }

    return ".bin";
  }

  private sanitizeJobForUser<
    T extends {
      internalInfo?: string | null;
    }
  >(job: T, user: JwtUser) {
    if (this.isManager(user)) {
      return job;
    }

    return {
      ...job,
      internalInfo: ""
    };
  }

}
