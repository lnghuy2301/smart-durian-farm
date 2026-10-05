import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsNumber, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { FarmListDto } from '../farms/farms.dto';
import { TREE_STATUSES, TreeStatus } from './trees.types';

export class TreeDetailsDto {
  @ApiProperty({ maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(80)
  variety!: string;

  @ApiProperty({ example: '2024-05-01T08:00:00+07:00', description: 'ISO timestamp có timezone, backend lưu UTC' })
  @IsString() @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  plant_date!: string;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180)
  longitude!: number;

  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90)
  latitude!: number;
}

export class CreateTreeDto extends TreeDetailsDto {
  @ApiProperty()
  @IsUUID('4')
  zone_id!: string;

  @ApiPropertyOptional({ enum: TREE_STATUSES, default: 'Active' })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(TREE_STATUSES)
  status?: TreeStatus;
}

// Không nhận zone_id, id hoặc tree_code khi sửa. Không có default status trên PATCH.
export class UpdateTreeDto extends PartialType(TreeDetailsDto, { skipNullProperties: false }) {
  @ApiPropertyOptional({ enum: TREE_STATUSES })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(TREE_STATUSES)
  status?: TreeStatus;
}

export class TreeListDto extends FarmListDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined) @IsUUID('4')
  zone_id?: string;

  @ApiPropertyOptional({ enum: TREE_STATUSES })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(TREE_STATUSES)
  status?: TreeStatus;
}

export class TreeCodeParamDto {
  @ApiProperty({ example: 'DRN-11111111-1111-4111-8111-111111111111' })
  @IsString()
  @Matches(/^DRN-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  treeCode!: string;
}
