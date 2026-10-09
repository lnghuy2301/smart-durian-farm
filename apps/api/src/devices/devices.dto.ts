import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsNumber, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { FarmListDto } from '../farms/farms.dto';
import { DEVICE_STATUSES, DeviceStatus } from './devices.types';

// Giữ nguyên chữ hoa/thường mã hardware; chỉ nhận một MQTT topic segment, không wildcard/path.
export const STATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class DeviceDetailsDto {
  @ApiProperty({ example: '2026-10-06T08:00:00+07:00', description: 'Ngày lắp ISO có timezone; lưu UTC' })
  @IsString() @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  installed_at!: string;

  @ApiProperty({ minimum: 0, maximum: 99999999.99, description: 'Chi phí decimal(10,2)' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(99999999.99)
  cost!: number;
}

export class CreateDeviceDto extends DeviceDetailsDto {
  @ApiProperty()
  @IsUUID('4')
  zone_id!: string;

  @ApiProperty({ example: 'DEMO_STATION', maxLength: 50, description: 'Mã ESP32 duy nhất, bất biến; khác UUID nội bộ' })
  @IsString() @MinLength(1) @MaxLength(50) @Matches(STATION_ID_PATTERN)
  station_id!: string;

  @ApiPropertyOptional({ enum: DEVICE_STATUSES, default: 'Active', description: 'Trạng thái quản trị Active/Inactive/Maintenance; không phải Online/Offline' })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(DEVICE_STATUSES)
  status?: DeviceStatus;
}

// Không có status mặc định trên PATCH để sửa cost/ngày lắp không tự kích hoạt thiết bị.
export class UpdateDeviceDto extends PartialType(DeviceDetailsDto, { skipNullProperties: false }) {
  @ApiPropertyOptional({ enum: DEVICE_STATUSES })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(DEVICE_STATUSES)
  status?: DeviceStatus;
}

export class DeviceListDto extends FarmListDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined) @IsUUID('4')
  zone_id?: string;

  @ApiPropertyOptional({ enum: DEVICE_STATUSES })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(DEVICE_STATUSES)
  status?: DeviceStatus;
}

export class DeviceStationParamDto {
  @ApiProperty({ example: 'DEMO_STATION' })
  @IsString() @MinLength(1) @MaxLength(50) @Matches(STATION_ID_PATTERN)
  stationId!: string;
}
