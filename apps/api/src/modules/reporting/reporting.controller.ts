import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { JwtUser } from "@tna-nexus/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ReportingService } from "./reporting.service";

@ApiTags("reporting")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: "reporting", version: "1" })
export class ReportingController {
  constructor(private readonly service: ReportingService) {}

  @Get("summary")
  summary(@CurrentUser() user: JwtUser) {
    return this.service.summary(user);
  }
}
