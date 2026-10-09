import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsNumber, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { FarmListDto } from '../farms/farms.dto';
import { SENSOR_STATUSES, SENSOR_TYPES, SensorStatus, SensorType, SensorUnit } from './sensors.types';

export const DATA_STREAM_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class SensorDetailsDto {
  @ApiProperty({ maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(80)
  name!: string;

  @ApiProperty({ maxLength: 16, description: 'Đơn vị kỳ vọng/configuration, không ghi đè đơn vị phần cứng trong dữ liệu lịch sử' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(16)
  unit!: SensorUnit;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: -99999.99, maximum: 99999.99, description: 'Both thresholds null, or both numeric with min < max' })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(-99999.99) @Max(99999.99)
  min_threshold?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: -99999.99, maximum: 99999.99 })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(-99999.99) @Max(99999.99)
  max_threshold?: number | null;
}
export class CreateSensorDto extends SensorDetailsDto {
  @ApiProperty({ description: 'Internal DEVICES.id UUID, not station_id' })
  @IsUUID('4')
  device_id!: string;

  @ApiProperty({ enum: SENSOR_TYPES, description: 'Immutable after registration' })
  @IsIn(SENSOR_TYPES)
  sensor_type!: SensorType;

  @ApiProperty({ example: '2', maxLength: 50, description: 'Exact hardware identifier; unique only within this Device' })
  @IsString() @MinLength(1) @MaxLength(50) @Matches(DATA_STREAM_ID_PATTERN)
  data_stream_id!: string;

  @ApiPropertyOptional({ enum: SENSOR_STATUSES, default: 'Active' })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(SENSOR_STATUSES)
  status?: SensorStatus;
}
// PATCH không có mặc định: bỏ qua giữ nguyên; null tường minh dùng để xóa cấu hình ngưỡng.
export class UpdateSensorDto extends PartialType(SensorDetailsDto, { skipNullProperties: false }) {
  @ApiPropertyOptional({ enum: SENSOR_STATUSES })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(SENSOR_STATUSES)
  status?: SensorStatus;
}
export class SensorListDto extends FarmListDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined) @IsUUID('4')
  device_id?: string;

  @ApiPropertyOptional({ enum: SENSOR_STATUSES })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(SENSOR_STATUSES)
  status?: SensorStatus;

  @ApiPropertyOptional({ enum: SENSOR_TYPES })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(SENSOR_TYPES)
  sensor_type?: SensorType;
}
export class SensorStreamParamDto {
  @ApiProperty()
  @IsUUID('4')
  deviceId!: string;

  @ApiProperty({ example: '2' })
  @IsString() @MinLength(1) @MaxLength(50) @Matches(DATA_STREAM_ID_PATTERN)
  dataStreamId!: string;
}
