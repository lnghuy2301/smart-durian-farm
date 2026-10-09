import { DynamicModule, Module } from '@nestjs/common';
import { DeviceRequestsController, DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({})
export class DevicesModule {
  static forMock(authModule: DynamicModule, farmsModule: DynamicModule, zonesModule: DynamicModule, treesModule: DynamicModule): DynamicModule {
    // Nhận đúng instance đang chạy để scope HTX/phân công và cây trong Zone không bị tách store.
    return { module: DevicesModule, imports: [authModule, farmsModule, zonesModule, treesModule],
      controllers: [DevicesController, DeviceRequestsController], providers: [DevicesService], exports: [DevicesService] };
  }
}
