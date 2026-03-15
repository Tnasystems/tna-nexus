import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { JwtUser } from "@tna-nexus/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ComplianceService } from "./compliance.service";

@ApiTags("compliance")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: "compliance", version: "1" })
export class ComplianceController {
  constructor(private readonly service: ComplianceService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() body: { title: string; dueDate: string }) {
    return this.service.create(user, body);
  }
}
