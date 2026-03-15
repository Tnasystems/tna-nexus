import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";
import { CreateUserDto } from "./users.dto";

@Injectable()
export class UsersService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  async list(user: JwtUser) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  }

  async create(user: JwtUser, dto: CreateUserDto) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.user.create({
      data: {
        id: randomUUID(),
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        passwordHash: await argon2.hash(dto.password)
      }
    });
  }
}
