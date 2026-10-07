import { DynamicModule, Module } from '@nestjs/common';
import { MqttConfig, MQTT_CONFIG } from './mqtt.config';
import { MqttController } from './mqtt.controller';
import { MqttService } from './mqtt.service';
import { MqttJsTransport, MqttTransport } from './mqtt.transport';

@Module({})
export class MqttModule {
  static register(config: MqttConfig, authModule: DynamicModule, devicesModule: DynamicModule,
    sensorsModule: DynamicModule, telemetryModule: DynamicModule): DynamicModule {
    // Reuse the exact module instances; rebuilding forMock here would create independent metadata stores.
    return { module: MqttModule, imports: [authModule, devicesModule, sensorsModule, telemetryModule], controllers: [MqttController],
      providers: [{ provide: MQTT_CONFIG, useValue: config },
        { provide: MqttTransport, useFactory: () => new MqttJsTransport(config) }, MqttService],
      exports: [MqttService, MqttTransport] };
  }
}
