import { ApiProperty } from "@nestjs/swagger";
import { ROLE_VALUES } from "@tna-nexus/shared";
import { IsEmail, IsIn, IsString, MinLength } from "class-validator";

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
