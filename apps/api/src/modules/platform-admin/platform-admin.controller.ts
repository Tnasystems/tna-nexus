import { Controller, Delete, Get, Param, Patch, UseGuards } from "@nestjs/common";
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

  @Patch("companies/:companyId/suspend")
  suspend(@Param("companyId") companyId: string) {
    return this.service.setCompanyStatus(companyId, "SUSPENDED");
  }

  @Patch("companies/:companyId/activate")
  activate(@Param("companyId") companyId: string) {
    return this.service.setCompanyStatus(companyId, "ACTIVE");
  }

  @Delete("companies/:companyId")
  remove(@Param("companyId") companyId: string) {
    return this.service.deleteCompany(companyId);
  }
}
