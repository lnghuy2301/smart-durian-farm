import { DynamicModule, Module } from '@nestjs/common';
import { TreeHarvestsController, HarvestRequestsController, HarvestBackdateController } from './tree-harvests.controller';
import { TreeHarvestsService } from './tree-harvests.service';

@Module({})
export class TreeHarvestsModule {
  static forMock(auth: DynamicModule, users: DynamicModule, farms: DynamicModule, zones: DynamicModule, trees: DynamicModule): DynamicModule {
    // Chỉ nhận các instance module có sẵn, không tạo lại store phụ thuộc.
    return { module: TreeHarvestsModule, imports: [auth, users, farms, zones, trees],
      controllers: [TreeHarvestsController, HarvestRequestsController, HarvestBackdateController],
      providers: [TreeHarvestsService], exports: [TreeHarvestsService] };
  }
}
