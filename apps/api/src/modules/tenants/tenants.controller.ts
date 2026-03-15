import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CreateTenantDto } from "./tenants.dto";
import { TenantsService } from "./tenants.service";

@ApiTags("tenants")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("PLATFORM_ADMIN")
@Controller({ path: "tenants", version: "1" })
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  create(@Body() body: CreateTenantDto) {
    return this.tenantsService.createTenant(body);
  }
}
