import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { JwtUser } from "@tna-nexus/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CreateUserDto, UpdateUserDto } from "./users.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: "users", version: "1" })
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user);
  }

  @Get(":userId")
  get(@CurrentUser() user: JwtUser, @Param("userId") userId: string) {
    return this.service.get(user, userId);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() body: CreateUserDto) {
    return this.service.create(user, body);
  }

  @Patch(":userId")
  update(@CurrentUser() user: JwtUser, @Param("userId") userId: string, @Body() body: UpdateUserDto) {
    return this.service.update(user, userId, body);
  }
}
