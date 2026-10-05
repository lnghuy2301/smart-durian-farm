import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsUUID, Matches, ValidateIf } from 'class-validator';
import { FarmPageDto } from '../farms/farms.dto';

export class CreateAssignmentRequestDto {
  @ApiProperty({ description: 'UUID Farmer Active nhận công việc' })
  @IsUUID('4')
  user_id!: string;

  @ApiPropertyOptional({ description: 'ISO 8601 có timezone; bỏ trống nghĩa là bắt đầu khi nhận việc' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsISO8601({ strict: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  start_date?: string;

  @ApiPropertyOptional({ nullable: true, description: 'ISO 8601 có timezone; null/bỏ trống nghĩa là không định hạn' })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsISO8601({ strict: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  end_date?: string | null;
}

export class AssignmentListDto extends FarmPageDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined) @IsUUID('4')
  zone_id?: string;
}
