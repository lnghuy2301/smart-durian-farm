import { DynamicModule, Module } from '@nestjs/common';
import { AdminGuard } from '../users/admin.guard';
import { StandardMaterialsController } from './standard-materials.controller';
import { StandardMaterialsService } from './standard-materials.service';

@Module({})
export class StandardMaterialsModule {
  static forMock(authModule: DynamicModule, materialsModule: DynamicModule, standardsModule: DynamicModule): DynamicModule {
    return {
      module: StandardMaterialsModule,
      imports: [authModule, materialsModule, standardsModule],
      controllers: [StandardMaterialsController],
      providers: [StandardMaterialsService, AdminGuard],
      exports: [StandardMaterialsService],
    };
  }
}
