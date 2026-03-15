import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { FormSchemaDefinition, JwtUser } from "@tna-nexus/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { FormsService } from "./forms.service";

@ApiTags("forms")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: "forms", version: "1" })
export class FormsController {
  constructor(private readonly service: FormsService) {}

  @Get("definitions")
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user);
  }

  @Post("definitions")
  create(@CurrentUser() user: JwtUser, @Body() body: FormSchemaDefinition) {
    return this.service.create(user, body);
  }
}
