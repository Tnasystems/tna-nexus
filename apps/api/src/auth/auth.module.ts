import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { SessionService } from "./session.service";
import { TenantAccessService } from "./tenant-access.service";

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow("JWT_ACCESS_SECRET"),
        signOptions: {
          expiresIn: config.getOrThrow("ACCESS_TOKEN_TTL")
        }
      })
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SessionService, TenantAccessService],
  exports: [AuthService, SessionService, TenantAccessService]
})
export class AuthModule {}
