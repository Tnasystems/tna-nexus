import { Injectable, NotFoundException } from "@nestjs/common";
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
    return prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  }

  async get(user: JwtUser, userId: string) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const existing = await prisma.user.findUnique({ where: { id: userId } });

    if (!existing) {
      throw new NotFoundException("User not found.");
    }

    return existing;
  }

  async create(user: JwtUser, dto: CreateUserDto) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.user.create({
      data: {
        id: randomUUID(),
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        accountStatus: dto.accountStatus ?? "ACTIVE",
        trainingRecordsJson: dto.trainingRecordsJson ?? "[]",
        passwordHash: await argon2.hash(dto.password)
      }
    });
  }

  async update(user: JwtUser, userId: string, dto: UpdateUserDto) {
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
        role: dto.role ?? undefined,
        accountStatus: dto.accountStatus ?? undefined,
        trainingRecordsJson: dto.trainingRecordsJson ?? undefined,
        passwordHash: dto.password ? await argon2.hash(dto.password) : undefined
      }
    });
  }
}
