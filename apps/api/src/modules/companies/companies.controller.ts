import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { JwtUser } from "@tna-nexus/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CompaniesService } from "./companies.service";

@ApiTags("companies")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: "companies", version: "1" })
export class CompaniesController {
  constructor(private readonly service: CompaniesService) {}

  @Get("me")
  me(@CurrentUser() user: JwtUser) {
    return this.service.profile(user);
  }
}
