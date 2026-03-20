import { Body, Controller, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import type { JwtUser } from "@tna-nexus/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { DocumentsService } from "./documents.service";

@ApiTags("documents")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: "documents", version: "1" })
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user);
  }

  @Post("placeholder")
  createPlaceholder(@CurrentUser() user: JwtUser, @Body() body: { name: string; content: string }) {
    return this.service.createPlaceholder(user, body);
  }

  @Get(":documentId/download")
  async download(@CurrentUser() user: JwtUser, @Param("documentId") documentId: string, @Res() reply: FastifyReply) {
    const file = await this.service.download(user, documentId);
    reply.header("Content-Type", file.mimeType);
    reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(file.fileName)}"`);
    return reply.send(file.buffer);
  }
}
