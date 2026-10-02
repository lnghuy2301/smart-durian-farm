import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsObject, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { PhoneDto } from '../auth/auth.dto';

export class RequestRegistrationEmailDto extends PhoneDto {
  @ApiProperty({ example: 'manager@example.com', maxLength: 255 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(255)
  gmail!: string;
}

export class VerifyRegistrationEmailDto extends RequestRegistrationEmailDto {
  @ApiProperty()
  @IsUUID('4')
  verification_id!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;
}

export class RegisterUserDto extends PhoneDto {
  @ApiProperty({ maxLength: 40 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  user_name!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: ['Farmer', 'Manager'] })
  @IsIn(['Farmer', 'Manager'])
  role!: 'Farmer' | 'Manager';

  @ApiPropertyOptional({ maxLength: 255 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @ValidateIf((_object, value) => value !== undefined)
  @IsEmail()
  @MaxLength(255)
  gmail?: string;

  @ApiPropertyOptional({ description: 'Bằng chứng do API xác minh email cấp; không phải gmail_verify=true từ client' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID('4')
  email_verification_token?: string;
}

export class CreateCooperativeDto {
  @ApiProperty({ maxLength: 40 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(40)
  cooperative_name!: string;

  @ApiProperty({ maxLength: 40 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(40)
  director!: string;

  @ApiProperty({ maxLength: 24 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(24)
  certificate_number!: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(255)
  address!: string;

  @ApiProperty({ maxLength: 14 })
  @IsString() @Matches(/^\+?\d{9,13}$/) @MaxLength(14)
  contact_number!: string;
}

export class ApproveManagerDto {
  @ApiPropertyOptional({ description: 'Gắn HTX hiện có chưa có Manager; không truyền cùng cooperative' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID('4')
  cooperative_id?: string;

  @ApiPropertyOptional({ type: CreateCooperativeDto, description: 'Tạo HTX mới khi duyệt' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => CreateCooperativeDto)
  cooperative?: CreateCooperativeDto;
}

// DTO rỗng để reject cũng không nhận role/status/gmail_verify tùy ý từ client.
export class RejectManagerDto {}
