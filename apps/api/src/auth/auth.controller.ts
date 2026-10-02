import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthGuard, AuthRequest } from './auth.guard';
import { LoginDto, PhoneDto, ResetPasswordDto } from './auth.dto';

@ApiTags('auth-local-test')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto) {
    return this.auth.login(body.phone_number, body.password);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  me(@Req() request: AuthRequest) {
    return request.user;
  }

  @Post('forgot-password')
  @HttpCode(202)
  forgotPassword(@Body() body: PhoneDto) {
    return this.auth.forgotPassword(body.phone_number);
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body.phone_number, body.otp, body.new_password);
  }

  @Get('test/sms')
  @ApiOperation({ summary: 'SMS giả lập local: lấy OTP để test, không gửi SMS thật' })
  testSms(@Query() query: PhoneDto) {
    return this.auth.testSms(query.phone_number);
  }
}
