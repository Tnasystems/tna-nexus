import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";
import { CreateUserDto, UpdateUserDto } from "./users.dto";

@Injectable()
export class UsersService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async list(user: JwtUser) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    if (this.isManager(user)) {
      return prisma.user.findMany({ orderBy: { createdAt: "desc" } });
    }

    const jobs = await prisma.job.findMany({
      where: { assignedOperativeIds: { has: user.sub } }
    });
    const visibleIds = [...new Set([user.sub, ...jobs.flatMap((job) => job.assignedOperativeIds)])];

    return prisma.user.findMany({
      where: { id: { in: visibleIds } },
      orderBy: { fullName: "asc" }
    });
  }

  async get(user: JwtUser, userId: string) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
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

    return existing;
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
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const existing = await prisma.user.findUnique({ where: { id: userId } });

    if (!existing) {
      throw new NotFoundException("User not found.");
    }

    return prisma.user.update({
      where: { id: userId },
      data: {
        email: dto.email ?? undefined,
        fullName: dto.fullName ?? undefined,
        phone: dto.phone ?? undefined,
        role: dto.role ?? undefined,
        accountStatus: dto.accountStatus ?? undefined,
        trainingRecordsJson: dto.trainingRecordsJson ?? undefined,
        passwordHash: dto.password ? await argon2.hash(dto.password) : undefined
      }
    });
  }

  private isManager(user: JwtUser) {
    return user.role === "PLATFORM_ADMIN" || user.role === "DIRECTOR" || user.role === "MANAGER";
  }

  private ensureManager(user: JwtUser) {
    if (!this.isManager(user)) {
      throw new ForbiddenException("You do not have permission to modify employees.");
    }
  }
}
