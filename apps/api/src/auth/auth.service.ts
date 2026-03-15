import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import type { JwtUser, Role } from "@tna-nexus/shared";
import { PlatformPrismaService } from "../database/platform-prisma.service";
import { SessionService } from "./session.service";
import { TenantAccessService } from "./tenant-access.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly platformPrisma: PlatformPrismaService,
    private readonly tenantAccess: TenantAccessService,
    private readonly sessionService: SessionService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService
  ) {}

  async login(email: string, password: string, tenantSlug?: string) {
    if (!tenantSlug) {
      const admin = await this.platformPrisma.platformAdmin.findUnique({ where: { email } });
      if (!admin || !(await argon2.verify(admin.passwordHash, password))) {
        throw new UnauthorizedException("Invalid credentials.");
      }

      return this.issueTokens({
        sub: admin.id,
        email: admin.email,
        role: "PLATFORM_ADMIN",
        sessionId: randomUUID()
      });
    }

    const { prisma, company } = await this.tenantAccess.getTenantContextBySlug(tenantSlug);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    return this.issueTokens({
      sub: user.id,
      email: user.email,
      role: user.role as Role,
      companyId: company.id,
      tenantSlug,
      sessionId: randomUUID()
    });
  }

  async refresh(refreshToken: string) {
    const payload = await this.sessionService.verifyRefreshToken(refreshToken);
    return this.issueTokens(payload, payload.sessionId);
  }

  private async issueTokens(user: JwtUser, existingSessionId?: string) {
    const sessionId = existingSessionId ?? user.sessionId;
    const payload = { ...user, sessionId };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.sessionService.createRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.getOrThrow("ACCESS_TOKEN_TTL")
    };
  }
}
