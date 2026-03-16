import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
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

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() body: CreateJobDto) {
    return this.service.create(user, body);
  }

  @Patch(":jobId")
  update(@CurrentUser() user: JwtUser, @Param("jobId") jobId: string, @Body() body: UpdateJobDto) {
    return this.service.update(user, jobId, body);
  }
}
