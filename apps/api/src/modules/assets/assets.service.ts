import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JwtUser } from "@tna-nexus/shared";
import { TenantAccessService } from "../../auth/tenant-access.service";
import { CreateAssetDto, UpdateAssetDto } from "./assets.dto";

@Injectable()
export class AssetsService {
  constructor(private readonly tenantAccess: TenantAccessService) {}

  list(user: JwtUser) {
    return this.tenantAccess.getTenantContext(user).then(({ prisma }) =>
      prisma.asset.findMany({ orderBy: { createdAt: "desc" } })
    );
  }

  create(user: JwtUser, body: CreateAssetDto) {
    this.ensureManager(user);
    return this.tenantAccess.getTenantContext(user).then(({ prisma }) =>
      prisma.asset.create({
        data: {
          id: randomUUID(),
          name: body.name,
          serialNumber: body.serialNumber,
          kind: body.kind ?? "GENERAL",
          assetStatus: body.assetStatus ?? "ACTIVE",
          registrationNumber: body.registrationNumber ?? null,
          notes: body.notes ?? "",
          lastServicedAt: body.lastServicedAt ? new Date(body.lastServicedAt) : null,
          nextServiceDueAt: body.nextServiceDueAt ? new Date(body.nextServiceDueAt) : null
        }
      })
    );
  }

  async update(user: JwtUser, assetId: string, body: UpdateAssetDto) {
    this.ensureManager(user);
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const existing = await prisma.asset.findUnique({ where: { id: assetId } });

    if (!existing) {
      throw new NotFoundException("Asset not found.");
    }

    return prisma.asset.update({
      where: { id: assetId },
      data: {
        name: body.name ?? undefined,
        serialNumber: body.serialNumber ?? undefined,
        kind: body.kind ?? undefined,
        assetStatus: body.assetStatus ?? undefined,
        registrationNumber: body.registrationNumber === undefined ? undefined : body.registrationNumber || null,
        notes: body.notes ?? undefined,
        lastServicedAt: body.lastServicedAt === undefined ? undefined : body.lastServicedAt ? new Date(body.lastServicedAt) : null,
        nextServiceDueAt: body.nextServiceDueAt === undefined ? undefined : body.nextServiceDueAt ? new Date(body.nextServiceDueAt) : null
      }
    });
  }

  async remove(user: JwtUser, assetId: string) {
    this.ensureManager(user);
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    const existing = await prisma.asset.findUnique({ where: { id: assetId } });

    if (!existing) {
      throw new NotFoundException("Asset not found.");
    }

    await prisma.asset.delete({ where: { id: assetId } });
    return { success: true };
  }

  private ensureManager(user: JwtUser) {
    if (user.role !== "PLATFORM_ADMIN" && user.role !== "DIRECTOR" && user.role !== "MANAGER") {
      throw new ForbiddenException("You do not have permission to manage assets.");
    }
  }
}
