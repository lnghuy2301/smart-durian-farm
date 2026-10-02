import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class FarmDetailsDto {
  @ApiProperty({ minimum: 0.001, maximum: 9999.999, description: 'Diện tích decimal(7,3)' })
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(9999.999)
  area_size!: number;

  @ApiProperty({ maxLength: 255 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(255)
  address!: string;

  @ApiProperty({ maxLength: 18 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(18)
  certificate_number!: string;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber({ maxDecimalPlaces: 7 }) @Min(-180) @Max(180)
  longitude!: number;

  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber({ maxDecimalPlaces: 7 }) @Min(-90) @Max(90)
  latitude!: number;
}

export class CreateFarmRequestDto extends FarmDetailsDto {
  @ApiPropertyOptional({ description: 'Admin bắt buộc chỉ định chủ Farmer; Farmer bỏ trống hoặc dùng id của mình' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID('4')
  owner_id?: string;
}

// Không cho PATCH owner_id hoặc cooperative_id để bỏ qua quy trình sở hữu/gia nhập HTX.
export class UpdateFarmRequestDto extends PartialType(FarmDetailsDto, { skipNullProperties: false }) {}

export class JoinCooperativeRequestDto {
  @ApiProperty()
  @IsUUID('4')
  cooperative_id!: string;
}

export class EmptyFarmActionDto {}

export class RejectFarmRequestDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(500)
  reason?: string;
}

export class FarmPageDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 100000 })
  @Type(() => Number) @IsInt() @Min(0) @Max(100000)
  offset = 0;
}

export class FarmListDto extends FarmPageDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MaxLength(100)
  q?: string;
}

export const FARM_REQUEST_STATUSES = ['Pending', 'Accepted', 'Rejected'] as const;
export type FarmRequestStatus = typeof FARM_REQUEST_STATUSES[number];

export class FarmRequestListDto extends FarmPageDto {
  @ApiPropertyOptional({ enum: FARM_REQUEST_STATUSES })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(FARM_REQUEST_STATUSES)
  status?: FarmRequestStatus;
}
