import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { CreateCooperativeDto } from '../users/users.dto';

export class UpdateCooperativeDto extends PartialType(CreateCooperativeDto, { skipNullProperties: false }) {}

export class ManagerCooperativeUpdateDto extends PartialType(
  PickType(CreateCooperativeDto, ['cooperative_name', 'director', 'address', 'contact_number'] as const),
  { skipNullProperties: false },
) {}

export class CooperativePageDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 100000 })
  @Type(() => Number) @IsInt() @Min(0) @Max(100000)
  offset = 0;
}

export class CooperativeListDto extends CooperativePageDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString() @MaxLength(100)
  q?: string;
}

export class CooperativeOtpDto {
  @ApiProperty({ example: '123456' })
  @IsString() @Matches(/^\d{6}$/)
  otp!: string;
}

export class EmptyCooperativeActionDto {}
