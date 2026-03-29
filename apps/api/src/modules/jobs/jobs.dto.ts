import { ApiProperty, PartialType } from "@nestjs/swagger";
import { JOB_STATUS_VALUES } from "@tna-nexus/shared";
import { IsArray, IsDateString, IsIn, IsObject, IsOptional, IsString, Matches } from "class-validator";

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalInfo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  internalInfo?: string;

  @ApiProperty({ enum: JOB_STATUS_VALUES })
  @IsIn(JOB_STATUS_VALUES)
  status!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  quoteStatus?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  scheduledTo?: string;

  @ApiProperty({ required: false, example: "08:00" })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  scheduledStartTime?: string;

  @ApiProperty({ required: false, example: "17:00" })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  scheduledEndTime?: string;

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

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedVehicleIds?: string[];

  @ApiProperty({
    required: false,
    type: Object,
    additionalProperties: {
      type: "array",
      items: { type: "string" }
    }
  })
  @IsOptional()
  @IsObject()
  dailyAssignments?: Record<string, string[]>;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  quotation?: Record<string, unknown>;

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  quotationRevisions?: Record<string, unknown>[];

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  finalMeasure?: Record<string, unknown>;
}

export class UpdateJobDto extends PartialType(CreateJobDto) {}

export class CreateContractDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateContractDto extends PartialType(CreateContractDto) {}

export class CreateQuoteItemDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  defaultRate?: string;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  contractRates?: Record<string, string>;
}

export class UpdateQuoteItemDto extends PartialType(CreateQuoteItemDto) {}
