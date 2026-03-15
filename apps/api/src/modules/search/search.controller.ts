import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { JwtUser } from "@tna-nexus/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { SearchService } from "./search.service";

@ApiTags("search")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: "search", version: "1" })
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  query(@CurrentUser() user: JwtUser, @Query("term") term: string) {
    return this.service.query(user, term);
  }
}
