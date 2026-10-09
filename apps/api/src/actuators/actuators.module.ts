import { DynamicModule, Module } from '@nestjs/common';
import { ActuatorRequestsController, ActuatorsController } from './actuators.controller';
import { ActuatorsService } from './actuators.service';

@Module({})
export class ActuatorsModule {
  static forMock(authModule: DynamicModule, farmsModule: DynamicModule, zonesModule: DynamicModule, devicesModule: DynamicModule): DynamicModule {
    // Nhận đúng instance dynamic module đang chạy để lookup Device và quyền Zone dùng chung store.
    return { module: ActuatorsModule, imports: [authModule, farmsModule, zonesModule, devicesModule],
      controllers: [ActuatorsController, ActuatorRequestsController], providers: [ActuatorsService], exports: [ActuatorsService] };
  }
}
