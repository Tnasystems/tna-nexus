import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, Matches, MinLength } from "class-validator";

export class CreateTenantDto {
  @ApiProperty()
  @IsString()
  companyName!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @ApiProperty()
  @IsString()
  planCode!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]+$/)
  databaseName!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]+$/)
  databaseUser!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  databasePassword!: string;

  @ApiProperty()
  @IsEmail()
  ownerEmail!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  ownerPassword!: string;
}
