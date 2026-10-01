import { DynamicModule, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { Environment } from '../config/environment';
import { HealthController } from './health.controller';

@Module({})
export class HealthModule {
  static register(config: Environment['database']): DynamicModule {
    return { module: HealthModule, imports: [DatabaseModule.register(config)], controllers: [HealthController] };
  }
}
