import { DynamicModule, Module } from '@nestjs/common';
import { Environment } from './config/environment';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';

@Module({})
export class AppModule {
  static register(config: Environment): DynamicModule {
    return { module: AppModule, imports: [HealthModule.register(config.database), ...(config.auth ? [AuthModule.forMock(config.auth)] : [])] };
  }
}
