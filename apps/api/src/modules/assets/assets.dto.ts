import { ApiProperty, PartialType } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString } from "class-validator";

export class CreateAssetDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  serialNumber!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  kind?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assetStatus?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  lastServicedAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  nextServiceDueAt?: string;
}

export class UpdateAssetDto extends PartialType(CreateAssetDto) {}
