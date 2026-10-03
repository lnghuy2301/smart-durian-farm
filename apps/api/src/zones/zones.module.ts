import { DynamicModule, Module } from '@nestjs/common';
import { ZoneRequestsController, ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

@Module({})
export class ZonesModule {
  static forMock(authModule: DynamicModule, farmsModule: DynamicModule, standardsModule: DynamicModule): DynamicModule {
    return { module: ZonesModule, imports: [authModule, farmsModule, standardsModule],
      controllers: [ZonesController, ZoneRequestsController], providers: [ZonesService], exports: [ZonesService] };
  }
}
