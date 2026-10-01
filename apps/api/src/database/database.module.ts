import { DynamicModule, Module } from '@nestjs/common';
import { Environment } from '../config/environment';
import { DatabaseService } from './database.service';

@Module({})
export class DatabaseModule {
  static register(config: Environment['database']): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: DatabaseService, useFactory: () => new DatabaseService(config) }],
      exports: [DatabaseService],
    };
  }
}
