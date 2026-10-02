import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { CatalogListDto, CATALOG_STATUSES, CatalogStatus } from '../catalog/catalog.dto';
export { CatalogStatus } from '../catalog/catalog.dto';

export const MATERIAL_TYPES = ['Fertilizer', 'Pesticide', 'Biological'] as const;
export type MaterialType = typeof MATERIAL_TYPES[number];

const trimText = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateMaterialDto {
  @ApiProperty({ maxLength: 255 })
  @Transform(trimText)
  @IsString() @MinLength(1) @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: MATERIAL_TYPES })
  @IsIn(MATERIAL_TYPES)
  material_type!: MaterialType;

  @ApiProperty({ maxLength: 100 })
  @Transform(trimText)
  @IsString() @MinLength(1) @MaxLength(100)
  default_dosage!: string;

  @ApiProperty({ maxLength: 10 })
  @Transform(trimText)
  @IsString() @MinLength(1) @MaxLength(10)
  unit!: string;

  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt() @Min(0) @Max(2147483647)
  quarantine_days!: number;

  @ApiPropertyOptional({ enum: CATALOG_STATUSES, default: 'Active' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(CATALOG_STATUSES)
  status?: CatalogStatus;
}

// PATCH bỏ qua field không gửi, nhưng null không được dùng để xóa dữ liệu bắt buộc.
export class UpdateMaterialDto extends PartialType(CreateMaterialDto, { skipNullProperties: false }) {}

export class MaterialListDto extends CatalogListDto {
  @ApiPropertyOptional({ enum: MATERIAL_TYPES })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(MATERIAL_TYPES)
  material_type?: MaterialType;
}
