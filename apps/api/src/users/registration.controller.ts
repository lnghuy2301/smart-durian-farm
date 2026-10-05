import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmailVerificationService } from './email/email-verification.service';
import { RegisterUserDto, RequestRegistrationEmailDto, VerifyRegistrationEmailDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users-registration-local-test')
@Controller('auth')
export class RegistrationController {
  constructor(@Inject(UsersService) private readonly users: UsersService,
    @Inject(EmailVerificationService) private readonly email: EmailVerificationService) {}

  @Post('register')
  @ApiOperation({ summary: 'Farmer Active ngay; Manager cần email đã xác minh và chờ Admin duyệt' })
  register(@Body() body: RegisterUserDto) { return this.users.register(body); }

  @Post('registration/email/request')
  @HttpCode(202)
  requestEmail(@Body() body: RequestRegistrationEmailDto) { return this.email.request(body.phone_number, body.gmail); }

  @Post('registration/email/verify')
  @HttpCode(200)
  verifyEmail(@Body() body: VerifyRegistrationEmailDto) { return this.email.verify(body); }
}
