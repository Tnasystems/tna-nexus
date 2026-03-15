import { ApiProperty } from "@nestjs/swagger";
import { TASK_STATUS_VALUES } from "@tna-nexus/shared";
import { IsIn, IsString } from "class-validator";

export class CreateTaskDto {
  @ApiProperty()
  @IsString()
  jobId!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty({ enum: TASK_STATUS_VALUES })
  @IsIn(TASK_STATUS_VALUES)
  status!: string;
}
