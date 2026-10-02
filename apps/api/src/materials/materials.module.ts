import { DynamicModule, Module } from '@nestjs/common';
import { AdminGuard } from '../users/admin.guard';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({})
export class MaterialsModule {
  static forMock(authModule: DynamicModule): DynamicModule {
    return {
      module: MaterialsModule,
      imports: [authModule],
      controllers: [MaterialsController],
      providers: [MaterialsService, AdminGuard],
      exports: [MaterialsService],
    };
  }
}
