import { DynamicModule, Module } from '@nestjs/common';
import { AdminGuard } from '../users/admin.guard';
import { StandardsController } from './standards.controller';
import { StandardsService } from './standards.service';

@Module({})
export class StandardsModule {
  static forMock(authModule: DynamicModule): DynamicModule {
    return {
      module: StandardsModule,
      imports: [authModule],
      controllers: [StandardsController],
      providers: [StandardsService, AdminGuard],
      exports: [StandardsService],
    };
  }
}
