import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { JwtUser } from "@tna-nexus/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CreateJobDto, UpdateJobDto } from "./jobs.dto";
import { JobsService } from "./jobs.service";

@ApiTags("jobs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: "jobs", version: "1" })
export class JobsController {
  constructor(private readonly service: JobsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user);
  }

  @Get(":jobId")
  get(@CurrentUser() user: JwtUser, @Param("jobId") jobId: string) {
    return this.service.get(user, jobId);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() body: CreateJobDto) {
    return this.service.create(user, body);
  }

  @Patch(":jobId")
  update(@CurrentUser() user: JwtUser, @Param("jobId") jobId: string, @Body() body: UpdateJobDto) {
    return this.service.update(user, jobId, body);
  }

  @Get(":jobId/documents")
  listDocuments(@CurrentUser() user: JwtUser, @Param("jobId") jobId: string) {
    return this.service.listDocuments(user, jobId);
  }

  @Post(":jobId/documents/:visibility")
  async uploadDocument(
    @CurrentUser() user: JwtUser,
    @Param("jobId") jobId: string,
    @Param("visibility") visibility: string,
    @Req() request: FastifyRequest
  ) {
    const file = await request.file();

    if (!file) {
      throw new BadRequestException("A file is required.");
    }

    const buffer = await file.toBuffer();

    return this.service.uploadDocument(user, jobId, visibility, {
      fileName: file.filename,
      mimeType: file.mimetype,
      buffer
    });
  }

  @Get(":jobId/documents/:documentId/download")
  async downloadDocument(
    @CurrentUser() user: JwtUser,
    @Param("jobId") jobId: string,
    @Param("documentId") documentId: string,
    @Res() reply: FastifyReply
  ) {
    const file = await this.service.downloadDocument(user, jobId, documentId);
    reply.header("Content-Type", file.mimeType);
    reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(file.fileName)}"`);
    return reply.send(file.buffer);
  }
}
