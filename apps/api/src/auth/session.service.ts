import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { JwtUser } from "@tna-nexus/shared";

@Injectable()
export class SessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService
  ) {}

  async createRefreshToken(user: JwtUser) {
    return this.jwtService.signAsync(user, {
      secret: this.config.getOrThrow("JWT_REFRESH_SECRET"),
      expiresIn: this.config.getOrThrow("REFRESH_TOKEN_TTL")
    });
  }

  async verifyRefreshToken(token: string): Promise<JwtUser> {
    try {
      return await this.jwtService.verifyAsync<JwtUser>(token, {
        secret: this.config.getOrThrow("JWT_REFRESH_SECRET")
      });
    } catch {
      throw new UnauthorizedException("Refresh token is invalid or expired.");
    }
  }
}
