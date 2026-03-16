import { ApiProperty, PartialType } from "@nestjs/swagger";
import { ROLE_VALUES } from "@tna-nexus/shared";
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  fullName!: string;

  @ApiProperty({ enum: ROLE_VALUES })
  @IsIn(ROLE_VALUES)
  role!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  password!: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  override email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  override fullName?: string;

  @ApiProperty({ enum: ROLE_VALUES, required: false })
  @IsOptional()
  @IsIn(ROLE_VALUES)
  override role?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(10)
  override password?: string;
}
