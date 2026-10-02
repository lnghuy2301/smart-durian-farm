import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class PhoneDto {
  @ApiProperty({ example: '0900000000', maxLength: 13 })
  @IsString()
  @Matches(/^\+?\d{9,13}$/)
  @MaxLength(13)
  phone_number!: string;
}

export class LoginDto extends PhoneDto {
  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class ResetPasswordDto extends PhoneDto {
  @ApiProperty({ example: '123456', description: 'OTP giả lập, đúng 6 chữ số' })
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  new_password!: string;
}
