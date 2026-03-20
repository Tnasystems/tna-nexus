import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
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

  @Post(":userId/training-records/:recordId/certificate")
  async uploadTrainingCertificate(
    @CurrentUser() user: JwtUser,
    @Param("userId") userId: string,
    @Param("recordId") recordId: string,
    @Req() request: FastifyRequest
  ) {
    const file = await request.file();

    if (!file) {
      throw new BadRequestException("A certificate file is required.");
    }

    const buffer = await file.toBuffer();

    return this.service.uploadTrainingCertificate(user, userId, recordId, {
      fileName: file.filename,
      mimeType: file.mimetype,
      buffer
    });
  }

  @Get(":userId/training-records/:recordId/certificate")
  async downloadTrainingCertificate(
    @CurrentUser() user: JwtUser,
    @Param("userId") userId: string,
    @Param("recordId") recordId: string,
    @Res() reply: FastifyReply
  ) {
    const file = await this.service.downloadTrainingCertificate(user, userId, recordId);
    reply.header("Content-Type", file.mimeType);
    reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(file.fileName)}"`);
    return reply.send(file.buffer);
  }
}
