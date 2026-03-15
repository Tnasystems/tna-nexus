import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient as PlatformPrismaClient } from "../../../../prisma/platform/generated/client";

@Injectable()
export class PlatformPrismaService extends PlatformPrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
