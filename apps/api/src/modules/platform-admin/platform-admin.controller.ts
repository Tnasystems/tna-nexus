import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PlatformAdminService } from "./platform-admin.service";

@ApiTags("platform-admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("PLATFORM_ADMIN")
@Controller({ path: "platform-admin", version: "1" })
export class PlatformAdminController {
  constructor(private readonly service: PlatformAdminService) {}

  @Get("dashboard")
  dashboard() {
    return this.service.dashboard();
  }

  @Get("companies")
  companies() {
    return this.service.listCompanies();
  }
}
