import { DynamicModule, Module } from '@nestjs/common';
import { MockAuthConfig } from '../config/environment';
import { LocalOtpProvider } from '../auth/sms/otp.provider';
import { MockSmsGateway } from '../auth/sms/sms.gateway';
import { TwilioVerifyGateway } from '../auth/sms/twilio-verify.gateway';
import { COOPERATIVE_OTP_PROVIDER, DisabledCooperativeOtpProvider } from './cooperative-otp.provider';
import { CooperativesController, CooperativeNotificationsController, CooperativeUpdateRequestsController } from './cooperatives.controller';
import { CooperativesService } from './cooperatives.service';

@Module({})
export class CooperativesModule {
  static forMock(config: MockAuthConfig, authModule: DynamicModule, usersModule: DynamicModule, farmsModule: DynamicModule): DynamicModule {
    return {
      module: CooperativesModule, imports: [authModule, usersModule, farmsModule],
      controllers: [CooperativesController, CooperativeNotificationsController, CooperativeUpdateRequestsController],
      providers: [CooperativesService, {
        provide: COOPERATIVE_OTP_PROVIDER,
        useFactory: () => config.sms.provider === 'mock' ? new LocalOtpProvider(new MockSmsGateway())
          : config.cooperativeSms ? new TwilioVerifyGateway(config.cooperativeSms) : new DisabledCooperativeOtpProvider(),
      }], exports: [CooperativesService],
    };
  }
}
