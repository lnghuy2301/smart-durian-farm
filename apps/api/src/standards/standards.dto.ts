import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { CatalogListDto, CATALOG_STATUSES, CatalogStatus } from '../catalog/catalog.dto';

const trimText = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateStandardDto {
  @ApiProperty({ maxLength: 40 })
  @Transform(trimText)
  @IsString() @MinLength(1) @MaxLength(40)
  code!: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trimText)
  @IsString() @MinLength(1) @MaxLength(100)
  name!: string;

  @ApiProperty({ maxLength: 10000 })
  @Transform(trimText)
  @IsString() @MaxLength(10000)
  description!: string;

  @ApiProperty({ maxLength: 120 })
  @Transform(trimText)
  @IsString() @MinLength(1) @MaxLength(120)
  certifying_body!: string;

  @ApiPropertyOptional({ enum: CATALOG_STATUSES, default: 'Active' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(CATALOG_STATUSES)
  status?: CatalogStatus;
}

export class UpdateStandardDto extends PartialType(CreateStandardDto, { skipNullProperties: false }) {}
export class StandardListDto extends CatalogListDto {}
