import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { JwtUser } from "@tna-nexus/shared";
import { ConfigService } from "@nestjs/config";
import { TenantAccessService } from "../../auth/tenant-access.service";

@Injectable()
export class DocumentsService {
  constructor(
    private readonly tenantAccess: TenantAccessService,
    private readonly config: ConfigService
  ) {}

  async list(user: JwtUser) {
    const { prisma } = await this.tenantAccess.getTenantContext(user);
    return prisma.document.findMany({ orderBy: { createdAt: "desc" } });
  }

  async createPlaceholder(user: JwtUser, body: { name: string; content: string }) {
    const { company, prisma } = await this.tenantAccess.getTenantContext(user);
    const id = randomUUID();
    const dir = join(process.cwd(), this.config.getOrThrow<string>("UPLOAD_ROOT"), company.slug, "documents");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${id}.txt`);
    await writeFile(filePath, body.content, "utf8");

    return prisma.document.create({
      data: {
        id,
        name: body.name,
        storagePath: filePath,
        mimeType: "text/plain"
      }
    });
  }
}
