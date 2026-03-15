import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient as PlatformPrismaClient } from "../generated/platform-client";

@Injectable()
export class PlatformPrismaService extends PlatformPrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
