import { ApiProperty } from "@nestjs/swagger";
import { JOB_STATUS_VALUES } from "@tna-nexus/shared";
import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class CreateJobDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  siteAddress!: string;

  @ApiProperty({ enum: JOB_STATUS_VALUES })
  @IsIn(JOB_STATUS_VALUES)
  status!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}
