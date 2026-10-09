import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { FarmListDto } from '../farms/farms.dto';
import { ACTUATOR_PURPOSES, ACTUATOR_STATUSES, ActuatorPurpose, ActuatorStatus } from './actuators.types';

// Protocol MQTT dùng JSON number. Chặn bigint ngoài miền nguyên chính xác để không định tuyến sai relay.
export const MAX_CAPABILITY_ID = Number.MAX_SAFE_INTEGER;

export class ActuatorDetailsDto {
  @ApiProperty({ maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(80)
  name!: string;
}
export class CreateActuatorDto extends ActuatorDetailsDto {
  @ApiProperty({ description: 'DEVICES.id UUID nội bộ; không station_id' })
  @IsUUID('4')
  device_id!: string;

  @ApiProperty({ enum: ACTUATOR_PURPOSES, description: 'Bất biến; Shared phục vụ cả tưới và phun, ví dụ bơm chung' })
  @IsIn(ACTUATOR_PURPOSES)
  purpose!: ActuatorPurpose;

  @ApiProperty({ type: Number, example: 6, minimum: 1, maximum: MAX_CAPABILITY_ID, description: 'Mã taskingCapabilityId firmware, bất biến; unique trong cùng Device' })
  @IsInt() @Min(1) @Max(MAX_CAPABILITY_ID)
  capability_id!: number;

  @ApiPropertyOptional({ enum: ACTUATOR_STATUSES, default: 'Active', description: 'Khả dụng metadata; không phải relay bật/tắt' })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(ACTUATOR_STATUSES)
  status?: ActuatorStatus;
}
// PATCH không đặt default status: sửa tên không tự kích hoạt actuator Inactive.
export class UpdateActuatorDto extends PartialType(ActuatorDetailsDto, { skipNullProperties: false }) {
  @ApiPropertyOptional({ enum: ACTUATOR_STATUSES })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(ACTUATOR_STATUSES)
  status?: ActuatorStatus;
}
export class ActuatorListDto extends FarmListDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined) @IsUUID('4')
  device_id?: string;

  @ApiPropertyOptional({ enum: ACTUATOR_STATUSES })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(ACTUATOR_STATUSES)
  status?: ActuatorStatus;

  @ApiPropertyOptional({ enum: ACTUATOR_PURPOSES })
  @ValidateIf((_object, value) => value !== undefined) @IsIn(ACTUATOR_PURPOSES)
  purpose?: ActuatorPurpose;
}
export class ActuatorCapabilityParamDto {
  @ApiProperty()
  @IsUUID('4')
  deviceId!: string;

  @ApiProperty({ type: Number, example: 6, minimum: 1, maximum: MAX_CAPABILITY_ID })
  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_CAPABILITY_ID)
  capabilityId!: number;
}
