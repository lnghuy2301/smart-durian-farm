import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsNumber, IsObject, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { FarmListDto, FarmPageDto } from '../farms/farms.dto';
import { HARVEST_STATUSES, HarvestRequest, HarvestStatus } from './tree-harvests.types';

export class HarvestDetailsDto {
  @ApiProperty({ maxLength: 50 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(50)
  season_name!: string;

  @ApiProperty({ example: '2026-10-05', description: 'Ngày thực tế theo lịch Việt Nam, YYYY-MM-DD' })
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true })
  harvest_date!: string;

  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt() @Min(1) @Max(2147483647)
  fruit_count!: number;

  @ApiProperty({ minimum: 0.01, maximum: 99999.99 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(99999.99)
  total_weight_kg!: number;

  @ApiProperty({ maxLength: 50 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(50)
  batch_code!: string;
}

export class CreateHarvestDto extends HarvestDetailsDto {
  @ApiProperty() @IsUUID('4')
  tree_id!: string;
}

export class UpdateHarvestDto extends PartialType(HarvestDetailsDto, { skipNullProperties: false }) {}

export class HarvestCorrectionDto {
  @ApiProperty({ maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ type: UpdateHarvestDto, description: 'Tác giả hết phân công chỉ gửi reason; chủ bổ sung changes sau' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsObject() @ValidateNested() @Type(() => UpdateHarvestDto)
  changes?: UpdateHarvestDto;
}

export class HarvestListDto extends FarmListDto {
  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsUUID('4')
  tree_id?: string;

  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsUUID('4')
  zone_id?: string;

  @ApiPropertyOptional({ enum: HARVEST_STATUSES }) @ValidateIf((_object, value) => value !== undefined) @IsIn(HARVEST_STATUSES)
  status?: HarvestStatus;
}

export class HarvestRequestListDto extends FarmPageDto {
  @ApiPropertyOptional({ enum: ['Pending', 'Accepted', 'Rejected'] })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(['Pending', 'Accepted', 'Rejected'])
  status?: HarvestRequest['status'];

  @ApiPropertyOptional() @ValidateIf((_object, value) => value !== undefined) @IsUUID('4')
  harvest_id?: string;
}

export class CreateHarvestBackdateDto {
  @ApiProperty() @IsUUID('4')
  user_id!: string;

  @ApiProperty() @IsUUID('4')
  zone_id!: string;

  @ApiProperty({ example: '2026-09-20' })
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true })
  harvest_date!: string;

  @ApiProperty({ example: '2026-10-06T08:00:00+07:00' })
  @IsString() @IsISO8601({ strict: true, strictSeparator: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  expires_at!: string;

  @ApiProperty({ maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(500)
  reason!: string;
}
