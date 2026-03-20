import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";
import { CreateUserDto, UpdateUserDto } from "./users.dto";

type TrainingRecord = {
  id: string;
  name: string;
  expiresOn: string;
  certificateFileName?: string;
  certificateDocumentId?: string;
  certificateMimeType?: string;
  certificateDataUrl?: string;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly tenantAccess: TenantAccessService,
    private readonly config: ConfigService
  ) {}

  async list(user: JwtUser) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    if (this.isManager(user)) {
      const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
      return users.map((entry) => this.mapUserForViewer(user, entry));
    }

    const jobs = await prisma.job.findMany({
      where: { assignedOperativeIds: { has: user.sub } }
    });
    const visibleIds = [...new Set([user.sub, ...jobs.flatMap((job) => job.assignedOperativeIds)])];

    const users = await prisma.user.findMany({
      where: { id: { in: visibleIds } },
      orderBy: { fullName: "asc" }
    });

    return users.map((entry) => this.mapUserForViewer(user, entry));
  }

  async get(user: JwtUser, userId: string) {
    const { company, prisma } = await this.tenantAccess.getTenantContext(user);
    const existing = await prisma.user.findUnique({ where: { id: userId } });

    if (!existing) {
      throw new NotFoundException("User not found.");
    }

    if (!this.isManager(user) && userId !== user.sub) {
      const sharedJob = await prisma.job.findFirst({
        where: {
          assignedOperativeIds: { has: user.sub },
          AND: { assignedOperativeIds: { has: userId } }
        }
      });

      if (!sharedJob) {
        throw new ForbiddenException("You do not have access to this employee.");
      }
    }

    const trainingRecords = await this.normalizeTrainingRecords(prisma, company.slug, userId, existing.trainingRecordsJson);
    if (trainingRecords.changed) {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { trainingRecordsJson: this.stringifyTrainingRecords(trainingRecords.records) }
      });

      return this.mapUserForViewer(user, updated);
    }

    return this.mapUserForViewer(user, existing);
  }

  async create(user: JwtUser, dto: CreateUserDto) {
    this.ensureManager(user);
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.user.create({
      data: {
        id: randomUUID(),
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        role: dto.role,
        accountStatus: dto.accountStatus ?? "ACTIVE",
        trainingRecordsJson: dto.trainingRecordsJson ?? "[]",
        passwordHash: await argon2.hash(dto.password)
      }
    });
  }

  async update(user: JwtUser, userId: string, dto: UpdateUserDto) {
    this.ensureManager(user);
    const { company, prisma } = await this.tenantAccess.getTenantContext(user);
    const existing = await prisma.user.findUnique({ where: { id: userId } });

    if (!existing) {
      throw new NotFoundException("User not found.");
    }

    const normalizedTrainingRecords = dto.trainingRecordsJson === undefined
      ? undefined
      : this.stringifyTrainingRecords((await this.normalizeTrainingRecords(prisma, company.slug, userId, dto.trainingRecordsJson)).records);

    return prisma.user.update({
      where: { id: userId },
      data: {
        email: dto.email ?? undefined,
        fullName: dto.fullName ?? undefined,
        phone: dto.phone ?? undefined,
        role: dto.role ?? undefined,
        accountStatus: dto.accountStatus ?? undefined,
        trainingRecordsJson: normalizedTrainingRecords,
        passwordHash: dto.password ? await argon2.hash(dto.password) : undefined
      }
    });
  }

  async uploadTrainingCertificate(
    user: JwtUser,
    userId: string,
    recordId: string,
    file: { fileName: string; mimeType: string; buffer: Buffer }
  ) {
    this.ensureManager(user);
    const { company, prisma } = await this.tenantAccess.getTenantContext(user);
    const existing = await prisma.user.findUnique({ where: { id: userId } });

    if (!existing) {
      throw new NotFoundException("User not found.");
    }

    const normalized = await this.normalizeTrainingRecords(prisma, company.slug, userId, existing.trainingRecordsJson);
    const records = [...normalized.records];
    const recordIndex = records.findIndex((record) => record.id === recordId);
    const currentRecord = recordIndex >= 0
      ? records[recordIndex]
      : { id: recordId, name: "New Certificate", expiresOn: "" };

    if (currentRecord.certificateDocumentId) {
      await this.deleteDocument(prisma, currentRecord.certificateDocumentId);
    }

    const document = await this.storeTrainingCertificate(prisma, company.slug, userId, recordId, file);
    const nextRecord: TrainingRecord = {
      ...currentRecord,
      certificateFileName: document.name,
      certificateDocumentId: document.id,
      certificateMimeType: document.mimeType
    };

    if (recordIndex >= 0) {
      records[recordIndex] = nextRecord;
    } else {
      records.push(nextRecord);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { trainingRecordsJson: this.stringifyTrainingRecords(records) }
    });

    return this.toManagerTrainingRecord(nextRecord);
  }

  async downloadTrainingCertificate(user: JwtUser, userId: string, recordId: string) {
    this.ensureManager(user);
    const { company, prisma } = await this.tenantAccess.getTenantContext(user);
    const existing = await prisma.user.findUnique({ where: { id: userId } });

    if (!existing) {
      throw new NotFoundException("User not found.");
    }

    const normalized = await this.normalizeTrainingRecords(prisma, company.slug, userId, existing.trainingRecordsJson);
    const record = normalized.records.find((entry) => entry.id === recordId);

    if (!record?.certificateDocumentId) {
      throw new NotFoundException("Certificate not found.");
    }

    const document = await prisma.document.findUnique({ where: { id: record.certificateDocumentId } });

    if (!document) {
      throw new NotFoundException("Certificate file not found.");
    }

    if (normalized.changed) {
      await prisma.user.update({
        where: { id: userId },
        data: { trainingRecordsJson: this.stringifyTrainingRecords(normalized.records) }
      });
    }

    return {
      fileName: document.name,
      mimeType: document.mimeType,
      buffer: await readFile(document.storagePath)
    };
  }

  private isManager(user: JwtUser) {
    return user.role === "PLATFORM_ADMIN" || user.role === "DIRECTOR" || user.role === "MANAGER";
  }

  private ensureManager(user: JwtUser) {
    if (!this.isManager(user)) {
      throw new ForbiddenException("You do not have permission to modify employees.");
    }
  }

  private mapUserForViewer<T extends { id: string; trainingRecordsJson: string }>(viewer: JwtUser, target: T) {
    const records = this.parseTrainingRecords(target.trainingRecordsJson);
    return {
      ...target,
      trainingRecordsJson: this.stringifyTrainingRecords(
        this.isManager(viewer)
          ? records.map((record) => this.toManagerTrainingRecord(record))
          : records.map((record) => this.toEmployeeTrainingRecord(record))
      )
    };
  }

  private async normalizeTrainingRecords(
    prisma: Awaited<ReturnType<TenantAccessService["getTenantContext"]>>["prisma"],
    companySlug: string,
    userId: string,
    value: string | null | undefined
  ) {
    const records = this.parseTrainingRecords(value);
    let changed = false;
    const normalized: TrainingRecord[] = [];

    for (const record of records) {
      if (record.certificateDataUrl) {
        const legacyFile = this.parseDataUrl(record.certificateDataUrl, record.certificateFileName);
        const document = await this.storeTrainingCertificate(prisma, companySlug, userId, record.id, legacyFile);
        normalized.push({
          id: record.id,
          name: record.name,
          expiresOn: record.expiresOn,
          certificateFileName: document.name,
          certificateDocumentId: document.id,
          certificateMimeType: document.mimeType
        });
        changed = true;
        continue;
      }

      const cleanRecord = this.cleanTrainingRecord(record);
      if (JSON.stringify(cleanRecord) !== JSON.stringify(record)) {
        changed = true;
      }
      normalized.push(cleanRecord);
    }

    return { records: normalized, changed };
  }

  private cleanTrainingRecord(record: Partial<TrainingRecord>): TrainingRecord {
    return {
      id: typeof record.id === "string" && record.id.trim() ? record.id : randomUUID(),
      name: typeof record.name === "string" ? record.name : "",
      expiresOn: typeof record.expiresOn === "string" ? record.expiresOn : "",
      ...(typeof record.certificateFileName === "string" && record.certificateFileName
        ? { certificateFileName: record.certificateFileName }
        : {}),
      ...(typeof record.certificateDocumentId === "string" && record.certificateDocumentId
        ? { certificateDocumentId: record.certificateDocumentId }
        : {}),
      ...(typeof record.certificateMimeType === "string" && record.certificateMimeType
        ? { certificateMimeType: record.certificateMimeType }
        : {})
    };
  }

  private parseTrainingRecords(value: string | null | undefined) {
    if (!value) {
      return [] as TrainingRecord[];
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed
            .filter((entry): entry is Partial<TrainingRecord> => typeof entry === "object" && entry !== null)
            .map((entry) => ({
              ...this.cleanTrainingRecord(entry),
              ...(typeof entry.certificateDataUrl === "string" && entry.certificateDataUrl
                ? { certificateDataUrl: entry.certificateDataUrl }
                : {})
            }))
        : [];
    } catch {
      return [] as TrainingRecord[];
    }
  }

  private stringifyTrainingRecords(records: TrainingRecord[]) {
    return JSON.stringify(records.map((record) => this.cleanTrainingRecord(record)));
  }

  private toEmployeeTrainingRecord(record: TrainingRecord): TrainingRecord {
    return {
      id: record.id,
      name: record.name,
      expiresOn: record.expiresOn
    };
  }

  private toManagerTrainingRecord(record: TrainingRecord): TrainingRecord {
    return this.cleanTrainingRecord(record);
  }

  private async storeTrainingCertificate(
    prisma: Awaited<ReturnType<TenantAccessService["getTenantContext"]>>["prisma"],
    companySlug: string,
    userId: string,
    recordId: string,
    file: { fileName: string; mimeType: string; buffer: Buffer }
  ) {
    const id = randomUUID();
    const safeName = this.sanitizeFileName(file.fileName, file.mimeType);
    const dir = join(
      process.cwd(),
      this.config.getOrThrow<string>("UPLOAD_ROOT"),
      companySlug,
      "users",
      userId,
      "training-certificates",
      recordId
    );

    await mkdir(dir, { recursive: true });

    const filePath = join(dir, `${id}-${safeName}`);
    await writeFile(filePath, file.buffer);

    return prisma.document.create({
      data: {
        id,
        name: safeName,
        storagePath: filePath,
        mimeType: file.mimeType || "application/octet-stream"
      }
    });
  }

  private parseDataUrl(value: string, fileName = "certificate") {
    const match = /^data:(.+?);base64,(.+)$/u.exec(value);
    if (!match) {
      throw new NotFoundException("Stored certificate data is invalid.");
    }

    return {
      fileName,
      mimeType: match[1],
      buffer: Buffer.from(match[2], "base64")
    };
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

  private async deleteDocument(
    prisma: Awaited<ReturnType<TenantAccessService["getTenantContext"]>>["prisma"],
    documentId: string
  ) {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      return;
    }

    await prisma.document.delete({ where: { id: documentId } });
    await unlink(document.storagePath).catch(() => undefined);
    const parentDirectory = dirname(document.storagePath);
    await rm(parentDirectory, { recursive: false, force: false }).catch(() => undefined);
  }
}
