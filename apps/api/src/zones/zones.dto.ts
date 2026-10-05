import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { FarmListDto } from '../farms/farms.dto';

export class ZoneDetailsDto {
  @ApiProperty()
  @IsUUID('4')
  standard_id!: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(255)
  zone_name!: string;

  @ApiProperty({ minimum: 0.001, maximum: 9999.999 })
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(9999.999)
  area_size!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180)
  longitude!: number;

  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90)
  latitude!: number;
}

export class CreateZoneDto extends ZoneDetailsDto {
  @ApiProperty()
  @IsUUID('4')
  farm_id!: string;
}

// Không chuyển Zone sang Farm khác, không cho client sửa id/owner/status.
export class UpdateZoneDto extends PartialType(ZoneDetailsDto, { skipNullProperties: false }) {}

export class ZoneListDto extends FarmListDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined) @IsUUID('4')
  farm_id?: string;
}
