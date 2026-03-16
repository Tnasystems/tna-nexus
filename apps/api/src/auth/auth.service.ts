import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import type { JwtUser, Role } from "@tna-nexus/shared";
import { PlatformPrismaService } from "../database/platform-prisma.service";
import { SecretCipherService } from "../database/secret-cipher.service";
import { TenantPrismaFactory } from "../database/tenant-prisma.factory";
import { SessionService } from "./session.service";
import { TenantAccessService } from "./tenant-access.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly platformPrisma: PlatformPrismaService,
    private readonly tenantAccess: TenantAccessService,
    private readonly sessionService: SessionService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tenantFactory: TenantPrismaFactory,
    private readonly secretCipher: SecretCipherService
  ) {}

  async login(email: string, password: string, tenantSlug?: string) {
    const admin = await this.platformPrisma.platformAdmin.findUnique({ where: { email } });
    if (admin && await argon2.verify(admin.passwordHash, password)) {
      return this.issueTokens({
        sub: admin.id,
        email: admin.email,
        role: "PLATFORM_ADMIN",
        sessionId: randomUUID()
      });
    }

    if (tenantSlug) {
      const tenantMatch = await this.loginWithTenantSlug(email, password, tenantSlug);
      if (tenantMatch) {
        return tenantMatch;
      }
    }

    const tenantUser = await this.findTenantUserByEmail(email);
    if (!tenantUser || !(await argon2.verify(tenantUser.user.passwordHash, password))) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    return this.issueTokens({
      sub: tenantUser.user.id,
      email: tenantUser.user.email,
      role: tenantUser.user.role as Role,
      companyId: tenantUser.companyId,
      tenantSlug: tenantUser.slug,
      sessionId: randomUUID()
    });
  }

  async refresh(refreshToken: string) {
    const payload = await this.sessionService.verifyRefreshToken(refreshToken);
    return this.issueTokens(payload, payload.sessionId);
  }

  async issueSupportSession(adminEmail: string, companyId: string, tenantSlug: string) {
    const admin = await this.platformPrisma.platformAdmin.findUnique({
      where: { email: adminEmail }
    });

    if (!admin) {
      throw new UnauthorizedException("Platform admin account not found.");
    }

    return this.issueTokens({
      sub: admin.id,
      email: admin.email,
      role: "PLATFORM_ADMIN",
      companyId,
      tenantSlug,
      sessionId: randomUUID()
    });
  }

  private async loginWithTenantSlug(email: string, password: string, tenantSlug: string) {
    const { prisma, company } = await this.tenantAccess.getTenantContextBySlug(tenantSlug);
    this.ensureCompanyCanLogin(company.status);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      return null;
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

  private async findTenantUserByEmail(email: string) {
    const connections = await this.platformPrisma.tenantDatabase.findMany({
      include: {
        company: true
      },
      orderBy: { createdAt: "asc" }
    });

    const matches: Array<{
      companyId: string;
      slug: string;
      user: { id: string; email: string; role: string; passwordHash: string };
    }> = [];

    for (const connection of connections) {
      const prisma = this.tenantFactory.getClient(
        this.toDatabaseUrl(
          connection.databaseName,
          connection.databaseUser,
          this.secretCipher.decrypt(connection.databasePasswordEncrypted)
        )
      );

      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        this.ensureCompanyCanLogin(connection.company.status);
        matches.push({
          companyId: connection.companyId,
          slug: connection.slug,
          user
        });
      }
    }

    if (matches.length > 1) {
      throw new UnauthorizedException("This email belongs to multiple companies. Use a unique email per company account.");
    }

    return matches[0] ?? null;
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

  private toDatabaseUrl(databaseName: string, databaseUser: string, databasePassword: string) {
    return `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@${this.config.getOrThrow("POSTGRES_HOST")}:${this.config.getOrThrow<number>("POSTGRES_PORT")}/${databaseName}?schema=public`;
  }

  private ensureCompanyCanLogin(status: string) {
    if (status === "SUSPENDED") {
      throw new UnauthorizedException("This company is suspended. Contact your platform administrator.");
    }
  }
}
