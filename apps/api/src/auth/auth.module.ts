import { DynamicModule, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MockAuthConfig } from '../config/environment';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { MockUserStore } from './mock-user.store';
import { MockSmsGateway, SmsGateway } from './sms/sms.gateway';
import { SpeedSmsGateway } from './sms/speedsms.gateway';

@Module({})
export class AuthModule {
  static forMock(config: MockAuthConfig): DynamicModule {
    return {
      module: AuthModule,
      imports: [JwtModule.register({
        secret: config.jwtSecret,
        signOptions: { algorithm: 'HS256', issuer: 'smart-durian-local-test', audience: 'smart-durian-client' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'smart-durian-local-test', audience: 'smart-durian-client' },
      })],
      controllers: [AuthController],
      providers: [
        { provide: MockUserStore, useFactory: () => MockUserStore.create(config) },
        { provide: SmsGateway, useFactory: () => config.sms.provider === 'mock' ? new MockSmsGateway() : new SpeedSmsGateway(config.sms) },
        AuthService, AuthGuard,
      ],
    };
  }
}
