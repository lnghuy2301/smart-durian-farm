import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MockAuthConfig } from '../config/environment';
import { AdminGuard } from './admin.guard';
import { EmailVerificationService } from './email/email-verification.service';
import { DisabledEmailSender, EmailSender, SmtpEmailSender } from './email/email.sender';
import { MockCooperativeStore } from './mock-cooperative.store';
import { RegistrationController } from './registration.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({})
export class UsersModule {
  static forMock(config: MockAuthConfig): DynamicModule {
    return {
      module: UsersModule,
      imports: [AuthModule.forMock(config)],
      controllers: [RegistrationController, UsersController],
      providers: [
        UsersService, MockCooperativeStore, EmailVerificationService, AdminGuard,
        {
          provide: EmailSender,
          useFactory: () => config.email ? new SmtpEmailSender(config.email) : new DisabledEmailSender(),
        },
      ],
    };
  }
}
