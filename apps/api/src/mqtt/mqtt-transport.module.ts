import { DynamicModule, Module } from '@nestjs/common';
import { MqttConfig, MQTT_CONFIG } from './mqtt.config';
import { MqttJsTransport, MqttTransport } from './mqtt.transport';

@Module({})
export class MqttTransportModule {
  static register(config: MqttConfig): DynamicModule {
    // AppModule tạo một instance dùng chung cho receiver và task publisher, tránh vòng DI/store trùng.
    return { module: MqttTransportModule, providers: [{ provide: MQTT_CONFIG, useValue: config },
      { provide: MqttTransport, useFactory: () => new MqttJsTransport(config) }], exports: [MQTT_CONFIG, MqttTransport] };
  }
}
