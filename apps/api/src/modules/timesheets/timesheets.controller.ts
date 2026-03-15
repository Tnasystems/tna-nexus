import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { JwtUser } from "@tna-nexus/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TimesheetsService } from "./timesheets.service";

@ApiTags("timesheets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: "timesheets", version: "1" })
export class TimesheetsController {
  constructor(private readonly service: TimesheetsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user);
  }

  @Post("clock-in")
  clockIn(@CurrentUser() user: JwtUser) {
    return this.service.clock(user, "CLOCK_IN");
  }

  @Post("clock-out")
  clockOut(@CurrentUser() user: JwtUser) {
    return this.service.clock(user, "CLOCK_OUT");
  }
}
