import { Global, Module } from "@nestjs/common";
import { PlatformPrismaService } from "./platform-prisma.service";
import { TenantConnectionService } from "./tenant-connection.service";
import { TenantPrismaFactory } from "./tenant-prisma.factory";
import { ProvisioningService } from "./provisioning.service";
import { SecretCipherService } from "./secret-cipher.service";

@Global()
@Module({
  providers: [PlatformPrismaService, TenantConnectionService, TenantPrismaFactory, ProvisioningService, SecretCipherService],
  exports: [PlatformPrismaService, TenantConnectionService, TenantPrismaFactory, ProvisioningService, SecretCipherService]
})
export class DatabaseModule {}
