import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { FarmPageDto } from '../farms/farms.dto';

export class TelemetryLatestDto extends FarmPageDto {
  @ApiPropertyOptional({ maxLength: 50, description: 'Stream metadata exact case; ví dụ chuỗi 301' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString() @MinLength(1) @MaxLength(50) @Matches(/^[A-Za-z0-9_-]+$/)
  data_stream_id?: string;
}

export class TelemetryHistoryDto extends TelemetryLatestDto {
  @ApiPropertyOptional({ description: 'received_at từ mốc này, inclusive; ISO8601 có timezone' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString() @IsISO8601({ strict: true, strictSeparator: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  from?: string;

  @ApiPropertyOptional({ description: 'received_at trước mốc này, exclusive; ISO8601 có timezone' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString() @IsISO8601({ strict: true, strictSeparator: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  to?: string;
}
