import { ApiProperty, PartialType } from "@nestjs/swagger";
import { JOB_STATUS_VALUES } from "@tna-nexus/shared";
import { IsArray, IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class CreateJobDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  companyJobNumber!: string;

  @ApiProperty()
  @IsString()
  customerJobNumber!: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  scheduledTo?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scheduledDays?: string[];

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedOperativeIds?: string[];
}

export class UpdateJobDto extends PartialType(CreateJobDto) {}
