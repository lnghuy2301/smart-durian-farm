import { DynamicModule, Module } from '@nestjs/common';
import { SensorRequestsController, SensorsController } from './sensors.controller';
import { SensorsService } from './sensors.service';

@Module({})
export class SensorsModule {
  static forMock(authModule: DynamicModule, farmsModule: DynamicModule, zonesModule: DynamicModule, devicesModule: DynamicModule): DynamicModule {
    // Nhận đúng instance dynamic module đang chạy để lookup Device và quyền Zone dùng chung store.
    return { module: SensorsModule, imports: [authModule, farmsModule, zonesModule, devicesModule],
      controllers: [SensorsController, SensorRequestsController], providers: [SensorsService], exports: [SensorsService] };
  }
}
