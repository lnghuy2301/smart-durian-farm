import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export const CATALOG_STATUSES = ['Active', 'Inactive'] as const;
export type CatalogStatus = typeof CATALOG_STATUSES[number];

export class CatalogListDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt() @Min(1) @Max(100)
  limit = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 100000 })
  @Type(() => Number)
  @IsInt() @Min(0) @Max(100000)
  offset = 0;

  @ApiPropertyOptional({ enum: CATALOG_STATUSES })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(CATALOG_STATUSES)
  status?: CatalogStatus;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString() @MaxLength(100)
  q?: string;
}
