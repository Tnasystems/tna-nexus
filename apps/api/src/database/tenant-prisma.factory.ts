import { Injectable } from "@nestjs/common";
import { PrismaClient as TenantPrismaClient } from "../../../../prisma/tenant/generated/client";

@Injectable()
export class TenantPrismaFactory {
  private readonly cache = new Map<string, TenantPrismaClient>();

  getClient(databaseUrl: string): TenantPrismaClient {
    const cached = this.cache.get(databaseUrl);
    if (cached) {
      return cached;
    }

    const client = new TenantPrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });

    this.cache.set(databaseUrl, client);
    return client;
  }
}
