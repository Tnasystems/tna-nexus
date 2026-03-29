import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { JwtUser } from "@tna-nexus/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AssetsService } from "./assets.service";
import { CreateAssetDto, UpdateAssetDto } from "./assets.dto";

@ApiTags("assets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: "assets", version: "1" })
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() body: CreateAssetDto) {
    return this.service.create(user, body);
  }

  @Patch(":assetId")
  update(@CurrentUser() user: JwtUser, @Param("assetId") assetId: string, @Body() body: UpdateAssetDto) {
    return this.service.update(user, assetId, body);
  }

  @Delete(":assetId")
  remove(@CurrentUser() user: JwtUser, @Param("assetId") assetId: string) {
    return this.service.remove(user, assetId);
  }
}
